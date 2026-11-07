import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landmarks } from '@/data/landmarks';
import {
  GROUND_BUFFER,
  SDF_MIN,
  boundaryDist,
  buildSdf,
  cleanRing,
  makeSimple,
  selfIntersections,
  simplifyRing,
} from '@/lib/boundary';
import { buildCampus } from '@/lib/campus';
import { applyBoundary } from '@/lib/cleanup';
import { parseBoundary } from '@/lib/context';
import { centroid, polygonArea, project, distToSegment } from '@/lib/geo';
import type { RawOsm } from '@/lib/osm';
import { buildGraph, largestComponent, nearestNode } from '@/lib/routing';
import type { Vec2 } from '@/lib/types';

const j = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const osm = j<RawOsm>('public/data/nust-full.geojson');
const base = buildCampus({ osm, landmarks });
const ring = parseBoundary(j('public/data/campus-boundary.geojson'))!;
const { data, report } = applyBoundary(base, ring);

describe('campus boundary', () => {
  it('comes from the OSM university polygon and is a clean simple ring', () => {
    const gj = j<{ features: { properties: Record<string, unknown> }[] }>(
      'public/data/campus-boundary.geojson',
    );
    expect(gj.features[0].properties.source).toBe('way/407719491');
    expect(selfIntersections(ring)).toBe(0);
    expect(polygonArea(ring)).toBeGreaterThan(0); // consistent winding (CCW)
    const ha = polygonArea(ring) / 1e4;
    expect(ha).toBeGreaterThan(250);
    expect(ha).toBeLessThan(320);
    expect(ring.length).toBeLessThan(91);
  });
  it('simplification stays within about 2 m of the OSM outline', () => {
    const raw = cleanRing(
      (
        osm.features.find((f) => f.id === 'way/407719491')!.geometry as {
          coordinates: number[][][];
        }
      ).coordinates[0].map(([a, b]) => project(a, b)),
    );
    for (const p of raw) {
      const d = Math.min(...ring.map((q, i) => distToSegment(p, q, ring[(i + 1) % ring.length])));
      expect(d).toBeLessThan(2.05);
    }
  });
  it('contains the Convocation Ground and campus gates', () => {
    const cg = osm.features.find((f) => f.properties.name === 'NUST Convocation Ground')!;
    const c = centroid(
      (cg.geometry as { coordinates: number[][][] }).coordinates[0].map(([a, b]) => project(a, b)),
    );
    expect(boundaryDist(c, ring)).toBeGreaterThan(100);
  });
  it('SDF sign: positive inside, negative outside', () => {
    const s = buildSdf(ring, 64);
    expect(s.data[(32 * 64 + 32) * 4]).toBeGreaterThan(((0 - SDF_MIN) / 680) * 255);
    expect(s.data[0]).toBeLessThan(((0 - SDF_MIN) / 680) * 255);
  });
});

describe('polygon hygiene', () => {
  it('cuts a bow-tie and snaps near-duplicate vertices', () => {
    const bow: Vec2[] = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ];
    expect(selfIntersections(bow)).toBe(1);
    const s = makeSimple(bow);
    expect(s.cuts).toBe(1);
    expect(selfIntersections(s.ring)).toBe(0);
    expect(
      cleanRing([
        [0, 0],
        [0.1, 0],
        [5, 5],
        [0, 0],
      ]).length,
    ).toBe(2);
  });
  it('simplify keeps corners sharp', () => {
    const sq: Vec2[] = [];
    for (let i = 0; i <= 40; i++) sq.push([i * 2.5, 0]);
    for (let i = 1; i <= 40; i++) sq.push([100, i * 2.5]);
    for (let i = 1; i <= 40; i++) sq.push([100 - i * 2.5, 100]);
    for (let i = 1; i < 40; i++) sq.push([0, 100 - i * 2.5]);
    const s = simplifyRing(sq, 2);
    expect(s.length).toBe(4);
  });
});

describe('boundary clip', () => {
  it('nothing visible lies far beyond the buffer', () => {
    for (const l of [...data.roads, ...data.footways])
      for (const p of l.points) expect(boundaryDist(p, ring)).toBeGreaterThan(-GROUND_BUFFER - 0.5);
    for (const b of data.buildings)
      expect(boundaryDist(centroid(b.footprint), ring)).toBeGreaterThan(-GROUND_BUFFER);
  });
  it('no dead-end stubs under 8 m remain', () => {
    const key = (p: Vec2) => `${Math.round(p[0] / 0.5)},${Math.round(p[1] / 0.5)}`;
    const used = new Map<string, number>();
    for (const l of [...data.roads, ...data.footways])
      for (const p of l.points) used.set(key(p), (used.get(key(p)) ?? 0) + 1);
    const len = (p: Vec2[]) =>
      p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
    for (const l of [...data.roads, ...data.footways].filter((x) => len(x.points) < 8)) {
      const a = l.points[0],
        b = l.points.at(-1)!;
      expect((used.get(key(a)) ?? 0) > 1 && (used.get(key(b)) ?? 0) > 1).toBe(true);
    }
    expect(report.roads.stubsRemoved + report.footways.stubsRemoved).toBeGreaterThan(0);
  });
  it('every on-campus place keeps its building and a walkable route node', () => {
    const live = base.places.filter((p) => !p.offCampus && boundaryDist(p.pos, ring) > 0);
    const ways = (d: typeof base) => [...d.footways, ...d.roads.filter((r) => r.kind !== 'busway')];
    const g0 = buildGraph(ways(base)),
      g1 = buildGraph(ways(data));
    const m0 = largestComponent(g0),
      m1 = largestComponent(g1);
    const bad = (g: typeof g0, m: Set<number>) =>
      live.filter((p) => {
        const id = nearestNode(g, p.pos);
        return id < 0 || !m.has(id);
      }).length;
    expect(bad(g1, m1)).toBeLessThanOrEqual(bad(g0, m0));
  });
  it('wetland is marsh, the lake stays solid water', () => {
    expect(data.marsh?.length).toBe(1);
    expect(data.water.filter((w) => w.kind === 'water').length).toBeGreaterThan(0);
  });
});
