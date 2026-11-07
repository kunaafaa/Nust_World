import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landmarks } from '@/data/landmarks';
import {
  bearingDeg,
  dist,
  haversine,
  insetRing,
  orientedBox,
  pointInPolygon,
  polygonArea,
  polylabel,
  project,
  sceneBearingDeg,
  unproject,
} from '@/lib/geo';

const pts: [number, number][] = landmarks.map((l) => [l.lng, l.lat]);

describe('projection', () => {
  it('round-trips under 1 cm', () => {
    for (const [lon, lat] of pts) {
      const [x, z] = project(lon, lat);
      const [lon2, lat2] = unproject(x, z);
      expect(haversine([lon, lat], [lon2, lat2])).toBeLessThan(0.01);
    }
  });
  it('north is up (-Z), east is +X', () => {
    const o = project(72.9915, 33.643);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(project(72.9915, 33.644)[1]).toBeLessThan(0);
    expect(project(72.9925, 33.643)[0]).toBeGreaterThan(0);
  });
  it('scene distance matches haversine within 0.5 m for every landmark pair', () => {
    let worst = 0;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.abs(
          dist(project(...pts[i]), project(...pts[j])) - haversine(pts[i], pts[j]),
        );
        worst = Math.max(worst, d);
      }
    expect(worst).toBeLessThan(0.5);
  });
  it('scene bearing matches great-circle bearing within 0.5° for every pair', () => {
    let worst = 0;
    for (let i = 0; i < pts.length; i++)
      for (let j = 0; j < pts.length; j++) {
        if (i === j || haversine(pts[i], pts[j]) < 5) continue;
        let d = Math.abs(
          sceneBearingDeg(project(...pts[i]), project(...pts[j])) - bearingDeg(pts[i], pts[j]),
        );
        if (d > 180) d = 360 - d;
        worst = Math.max(worst, d);
      }
    expect(worst).toBeLessThan(0.5);
  });
});

describe('polygon helpers', () => {
  const sq: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ];
  it('polylabel of a rectangle is its middle', () => {
    const p = polylabel([sq], 0.1);
    expect(p[1]).toBeCloseTo(5, 0);
  });
  it('polylabel of a C shape stays inside', () => {
    const c: [number, number][] = [
      [0, 0],
      [30, 0],
      [30, 10],
      [10, 10],
      [10, 20],
      [30, 20],
      [30, 30],
      [0, 30],
    ];
    expect(pointInPolygon(polylabel([c]), [c])).toBe(true);
  });
  it('inset shrinks area and collapses tiny shapes', () => {
    const r = insetRing(sq, 2)!;
    expect(Math.abs(polygonArea(r))).toBeCloseTo(16 * 6, 0);
    expect(
      insetRing(
        [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
        ],
        3,
      ),
    ).toBeNull();
  });
  it('oriented box finds length/width of a rotated rectangle', () => {
    const a = 0.6,
      c = Math.cos(a),
      s = Math.sin(a);
    const rot = sq.map(([x, z]) => [x * c - z * s, x * s + z * c] as [number, number]);
    const b = orientedBox(rot);
    expect(b.length).toBeCloseTo(20, 3);
    expect(b.width).toBeCloseTo(10, 3);
  });
});

describe('real data sanity', () => {
  it('Convocation Ground is roughly circular', () => {
    const full = JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8'));
    const f = full.features.find(
      (x: { properties: { name?: string } }) => x.properties.name === 'NUST Convocation Ground',
    );
    expect(f).toBeTruthy();
    const ring = (f.geometry.coordinates[0] as [number, number][]).map(([lo, la]) =>
      project(lo, la),
    );
    const area = Math.abs(polygonArea(ring));
    let per = 0;
    for (let i = 0; i < ring.length; i++) per += dist(ring[i], ring[(i + 1) % ring.length]);
    const circularity = (4 * Math.PI * area) / (per * per); // 1 = perfect circle
    expect(circularity).toBeGreaterThan(0.85);
  });
});
