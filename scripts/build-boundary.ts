/**
 * Derives the campus boundary from our own OSM data and writes it as GeoJSON.
 *   npm run boundary  -> data/campus-boundary.geojson (+ public/data copy), public/data/context-roads.json
 * Method 1 (used when it exists): the NUST amenity=university polygon in nust-full.geojson that contains the Convocation Ground.
 * Method 2 (fallback): polygonize the ring of bounding roads. Not needed while method 1 is complete.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import {
  cleanRing,
  makeSimple,
  orient,
  selfIntersections,
  simplifyRing,
} from '../src/lib/boundary';
import { pointInRing, polygonArea, project, unproject } from '../src/lib/geo';
import type { Vec2 } from '../src/lib/types';

const osm = JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as {
  features: {
    id: string;
    properties: Record<string, string>;
    geometry: { type: string; coordinates: number[][][] };
  }[];
};
const cg = osm.features.find(
  (f) => f.properties.name === 'NUST Convocation Ground' && f.geometry.type === 'Polygon',
);
if (!cg) throw new Error('Convocation Ground polygon not found');
const cr = cg.geometry.coordinates[0].map(([a, b]) => project(a, b));
const cp: Vec2 = [
  cr.reduce((s, p) => s + p[0], 0) / cr.length,
  cr.reduce((s, p) => s + p[1], 0) / cr.length,
];
const cands = osm.features
  .filter(
    (f) =>
      f.geometry.type === 'Polygon' &&
      (f.properties.amenity === 'university' || f.properties.landuse === 'education'),
  )
  .map((f) => ({ f, ring: cleanRing(f.geometry.coordinates[0].map(([a, b]) => project(a, b))) }))
  .filter((c) => pointInRing(cp, c.ring))
  .sort((a, b) => Math.abs(polygonArea(b.ring)) - Math.abs(polygonArea(a.ring)));
if (!cands.length)
  throw new Error(
    'No university polygon contains the Convocation Ground: fall back to road polygonizing',
  );
const src = cands[0];
const raw = src.ring;
const crossBefore = selfIntersections(raw);
const simple = makeSimple(raw);
const simp = simplifyRing(simple.ring, 2);
const ring = orient(cleanRing(simp, 0.3));
const crossAfter = selfIntersections(ring);
const ha = Math.abs(polygonArea(ring)) / 1e4;
const closed = [...ring, ring[0]].map(([x, z]) => unproject(x, z).map((v) => +v.toFixed(7)));
const gj = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        source: src.f.id,
        method: 'OSM amenity=university polygon containing the Convocation Ground',
        areaHa: +ha.toFixed(1),
        vertices: ring.length,
        verticesRaw: raw.length,
        simplifyToleranceM: 2,
        license: 'ODbL, © OpenStreetMap contributors',
      },
      geometry: { type: 'Polygon', coordinates: [closed] },
    },
  ],
};
writeFileSync('data/campus-boundary.geojson', JSON.stringify(gj));
copyFileSync('data/campus-boundary.geojson', 'public/data/campus-boundary.geojson');

// Context roads: compact copy for the runtime (lng/lat pairs, class only).
const ctx = JSON.parse(readFileSync('data/context-roads.json', 'utf8')) as {
  timestamp?: string;
  ways: { hw?: string; pts: number[][] }[];
};
const skip = new Set([
  'footway',
  'path',
  'steps',
  'cycleway',
  'pedestrian',
  'track',
  'corridor',
  'bridleway',
  'proposed',
  'construction',
  'raceway',
  'platform',
]);
const keep = ctx.ways.filter((w) => w.hw && !skip.has(w.hw));
writeFileSync(
  'public/data/context-roads.json',
  JSON.stringify({
    timestamp: ctx.timestamp,
    ways: keep.map((w) => ({ k: w.hw, p: w.pts.flat() })),
  }),
);
console.log({
  source: src.f.id,
  ha: +ha.toFixed(1),
  raw: raw.length,
  simplified: ring.length,
  crossBefore,
  cutsMade: simple.cuts,
  crossAfter,
  contextWays: keep.length,
  of: ctx.ways.length,
  otherCandidates: cands.length - 1,
});
