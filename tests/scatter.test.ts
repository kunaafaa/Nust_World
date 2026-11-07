import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landmarks } from '@/data/landmarks';
import { buildCampus } from '@/lib/campus';
import { distToSegment, pointInRing } from '@/lib/geo';
import type { RawOsm } from '@/lib/osm';
import { buildObstacles, scatterParkedCars, scatterTrees, TREE_CAP } from '@/lib/scatter';
import type { Vec2 } from '@/lib/types';

const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const obs = buildObstacles(data);
const trees = scatterTrees(data, obs);
const parked = scatterParkedCars(data, obs);

const inAny = (p: Vec2, rings: Vec2[][]) => rings.some((r) => pointInRing(p, r));
const bRings = data.buildings.filter((b) => !b.offCampus).map((b) => b.footprint);
const wRings = data.water.map((w) => w.points);
const pRings = data.pitches.map((w) => w.points);
const HALF: Record<string, number> = {
  trunk: 6.5,
  secondary: 4,
  tertiary: 3.5,
  residential: 3,
  unclassified: 3,
  service: 2,
  busway: 3.5,
  primary: 6,
  living_street: 2.5,
};
const onRoadCentre = (p: Vec2) =>
  data.roads.some((r) =>
    r.points.some(
      (q, i) => i > 0 && distToSegment(p, r.points[i - 1], q) < (HALF[r.kind] ?? 3) * 0.5,
    ),
  );

describe('trees', () => {
  it('are deterministic', () => {
    const again = scatterTrees(data, obs);
    expect(again.length).toBe(trees.length);
    expect(again[10]).toEqual(trees[10]);
  });
  it('exist in meaningful numbers and use four types', () => {
    console.log('trees', trees.length, 'cap(high)', TREE_CAP.high);
    expect(trees.length).toBeGreaterThan(500);
    expect(new Set(trees.map((t) => t.type)).size).toBe(4);
  });
  it('never sit inside buildings, water or pitches or on road centrelines', () => {
    for (const t of trees.slice(0, 6000)) {
      const p: Vec2 = [t.x, t.z];
      expect(inAny(p, bRings)).toBe(false);
      expect(inAny(p, wRings)).toBe(false);
      expect(inAny(p, pRings)).toBe(false);
      expect(onRoadCentre(p)).toBe(false);
    }
  });
});

describe('parked cars', () => {
  it('exist and fill bays', () => {
    console.log('parked', parked.cars.length, 'bays', parked.bays.length);
    expect(parked.cars.length).toBeGreaterThan(100);
    expect(parked.bays.length).toBeGreaterThanOrEqual(parked.cars.length - 60);
  });
  it('never sit inside buildings, water or pitches', () => {
    for (const c of parked.cars) {
      const p: Vec2 = [c.x, c.z];
      expect(inAny(p, bRings)).toBe(false);
      expect(inAny(p, wRings)).toBe(false);
      expect(inAny(p, pRings)).toBe(false);
    }
  });
  it('parking-lot cars stay off road centrelines', () => {
    const lotCars = parked.cars.slice(0, parked.bays.length);
    const bad = lotCars.filter((c) => onRoadCentre([c.x, c.z]));
    expect(bad.length).toBe(0);
  });
});
