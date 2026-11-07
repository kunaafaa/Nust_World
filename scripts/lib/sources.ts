/**
 * Shared loaders for the topo merge: our OSM-derived campus, Overture (direct download, primary) and the TopoExport
 * references (cross-check, contours, trees). Everything is returned in scene metres (lib/geo.ts projection).
 */
import { readFileSync } from 'node:fs';
import { landmarks } from '../../src/data/landmarks';
import { buildCampus } from '../../src/lib/campus';
import { polygonArea, project, pointInRing } from '../../src/lib/geo';
import type { RawOsm } from '../../src/lib/osm';
import type { CampusData, Vec2 } from '../../src/lib/types';

export const loadOurs = (): CampusData =>
  buildCampus({
    osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
    landmarks,
  });

export interface OvBuilding {
  id: string;
  ring: Vec2[];
  upstream: string;
  height?: number;
  floors?: number;
  name?: string;
  area: number;
}
export interface OvSegment {
  id: string;
  cls: string;
  name?: string;
  upstream: string;
  pts: Vec2[];
}

const upstreamOf = (s: string | null) => {
  try {
    return (
      [...new Set((JSON.parse(s ?? '[]') as { dataset: string }[]).map((x) => x.dataset))].join(
        ' + ',
      ) || 'unknown'
    );
  } catch {
    return 'unknown';
  }
};
type Gj = {
  features: {
    properties: Record<string, string | number | null>;
    geometry: { type: string; coordinates: unknown };
  }[];
};
const open = (r: Vec2[]) =>
  r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]
    ? r.slice(0, -1)
    : r;

export function loadOvBuildings(): OvBuilding[] {
  const gj = JSON.parse(readFileSync('data/overture/overture-buildings.geojson', 'utf8')) as Gj;
  const out: OvBuilding[] = [];
  for (const f of gj.features) {
    const polys =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as number[][][]]
        : f.geometry.type === 'MultiPolygon'
          ? (f.geometry.coordinates as number[][][][])
          : [];
    polys.forEach((p, i) => {
      const ring = open(p[0].map(([lng, lat]) => project(lng, lat)));
      if (ring.length < 3) return;
      out.push({
        id: `overture/${f.properties.id}${polys.length > 1 ? '#' + i : ''}`,
        ring,
        upstream: upstreamOf(f.properties.sources as string | null),
        height: (f.properties.height as number | null) ?? undefined,
        floors: (f.properties.num_floors as number | null) ?? undefined,
        name: (f.properties.name as string | null) ?? undefined,
        area: Math.abs(polygonArea(ring)),
      });
    });
  }
  return out;
}

export function loadOvSegments(): OvSegment[] {
  const gj = JSON.parse(readFileSync('data/overture/overture-segments.geojson', 'utf8')) as Gj;
  const out: OvSegment[] = [];
  for (const f of gj.features) {
    const lines =
      f.geometry.type === 'LineString'
        ? [f.geometry.coordinates as number[][]]
        : f.geometry.type === 'MultiLineString'
          ? (f.geometry.coordinates as number[][][])
          : [];
    lines.forEach((l, i) =>
      out.push({
        id: `overture/${f.properties.id}${lines.length > 1 ? '#' + i : ''}`,
        cls: String(f.properties.class ?? ''),
        name: (f.properties.name as string | null) ?? undefined,
        upstream: upstreamOf(f.properties.sources as string | null),
        pts: l.map(([lng, lat]) => project(lng, lat)),
      }),
    );
  }
  return out;
}

export const bbox = (r: Vec2[]): [number, number, number, number] => {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const [x, z] of r) {
    a = Math.min(a, x);
    b = Math.min(b, z);
    c = Math.max(c, x);
    d = Math.max(d, z);
  }
  return [a, b, c, d];
};

/** Polygon IoU on a 0.5 m raster over the union bounding box. */
export function iou(a: Vec2[], b: Vec2[]): number {
  const A = bbox(a),
    B = bbox(b);
  const x0 = Math.max(A[0], B[0]),
    z0 = Math.max(A[1], B[1]),
    x1 = Math.min(A[2], B[2]),
    z1 = Math.min(A[3], B[3]);
  if (x1 <= x0 || z1 <= z0) return 0;
  const ux0 = Math.min(A[0], B[0]),
    uz0 = Math.min(A[1], B[1]),
    ux1 = Math.max(A[2], B[2]),
    uz1 = Math.max(A[3], B[3]);
  const step = Math.max(0.5, Math.sqrt(((ux1 - ux0) * (uz1 - uz0)) / 40000));
  let inter = 0,
    uni = 0;
  for (let z = uz0 + step / 2; z < uz1; z += step)
    for (let x = ux0 + step / 2; x < ux1; x += step) {
      const ia = pointInRing([x, z], a),
        ib = pointInRing([x, z], b);
      if (ia && ib) inter++;
      if (ia || ib) uni++;
    }
  return uni ? inter / uni : 0;
}
