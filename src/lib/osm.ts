import { GLOBAL_OFFSET } from './config';
import { CAMPUS_BBOX, project as projectRaw } from './geo';
import type { Vec2 } from './types';

/** Raw osmtogeojson / overpass-turbo FeatureCollection. */
export interface RawFeature {
  id?: string;
  properties: Record<string, string>;
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] }
    | { type: 'MultiPolygon'; coordinates: [number, number][][][] };
}
export interface RawOsm {
  features: RawFeature[];
  timestamp?: string;
  generator?: string;
}

export type OsmGeom =
  | { kind: 'point'; p: Vec2 }
  | { kind: 'line'; pts: Vec2[] }
  /** rings[0] is the outer ring, the rest are holes (open rings: first point not repeated). */
  | { kind: 'poly'; rings: Vec2[][] };

export interface OsmFeature {
  /** e.g. "way/123" */
  id: string;
  type: 'node' | 'way' | 'relation';
  num: number;
  tags: Record<string, string>;
  geom: OsmGeom;
}

const PAD = 0.0025;
/** OSM → scene. Applies the (default OFF) survey correction. */
const project = (lon: number, lat: number): Vec2 => {
  const [x, z] = projectRaw(lon, lat);
  return GLOBAL_OFFSET.enabled ? [x + GLOBAL_OFFSET.east, z - GLOBAL_OFFSET.north] : [x, z];
};

function openRing(r: Vec2[]): Vec2[] {
  const a = r[0],
    b = r[r.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
}

/**
 * Normalise overpass-turbo GeoJSON into projected features. Multipolygon relations arrive as Polygon
 * (outer + inner rings) or MultiPolygon (split into one feature per outer ring, suffixed #n).
 * Everything is clipped to the campus bbox (+pad) by the feature's first vertex.
 */
export function parseOsm(raw: RawOsm): OsmFeature[] {
  const [w, s, e, n] = CAMPUS_BBOX;
  const inside = (lon: number, lat: number) =>
    lon >= w - PAD && lon <= e + PAD && lat >= s - PAD && lat <= n + PAD;
  const out: OsmFeature[] = [];
  for (const f of raw.features) {
    const tags = { ...f.properties };
    const id = String(f.id ?? tags['@id'] ?? tags.id);
    const [t, nums] = id.split('/');
    const type = (
      t === 'node' || t === 'way' || t === 'relation' ? t : 'way'
    ) as OsmFeature['type'];
    const num = parseInt(nums ?? id, 10);
    const g = f.geometry;
    if (g.type === 'Point') {
      if (!inside(g.coordinates[0], g.coordinates[1])) continue;
      out.push({
        id,
        type,
        num,
        tags,
        geom: { kind: 'point', p: project(g.coordinates[0], g.coordinates[1]) },
      });
    } else if (g.type === 'LineString') {
      const m = g.coordinates[Math.floor(g.coordinates.length / 2)];
      if (!inside(m[0], m[1])) continue;
      out.push({
        id,
        type,
        num,
        tags,
        geom: { kind: 'line', pts: g.coordinates.map(([a, b]) => project(a, b)) },
      });
    } else {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      polys.forEach((rings, i) => {
        const o = rings[0];
        const m = o[Math.floor(o.length / 2)];
        if (!inside(m[0], m[1])) return;
        out.push({
          id: polys.length > 1 ? `${id}#${i}` : id,
          type,
          num,
          tags,
          geom: {
            kind: 'poly',
            rings: rings.map((r) => openRing(r.map(([a, b]) => project(a, b)))),
          },
        });
      });
    }
  }
  return out;
}

/** "30", "30 m", "30ft", "40 feet" → metres. Returns undefined for junk or values ≤ 2 m. */
export function parseHeight(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v
    .trim()
    .toLowerCase()
    .match(/^([\d.]+)\s*(m|meters?|metres?|ft|feet|')?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const metres = m[2] && /ft|feet|'/.test(m[2]) ? n * 0.3048 : n;
  return metres > 2 ? metres : undefined;
}

export const names = (t: Record<string, string>) =>
  [t.name, t['name:en'], t.alt_name, t.short_name, t.official_name].filter((x): x is string => !!x);
