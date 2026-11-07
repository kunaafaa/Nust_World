import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { landmarks } from '@/data/landmarks';
import { buildCampus } from '@/lib/campus';
import { pointInRing, project } from '@/lib/geo';
import type { RawOsm } from '@/lib/osm';
import { buildGraph, largestComponent } from '@/lib/routing';
import { scatterTrees, buildObstacles } from '@/lib/scatter';
import { Terrain, groundY, pathLength3d, setTerrain, type TerrainFile } from '@/lib/terrain';
import {
  applyTopoMerge,
  type TopoMergeFile,
  type TopoOverrides,
  type TopoTreesFile,
} from '@/lib/topoMerge';
import { fromUtm, toUtm } from '../scripts/lib/utm';

const read = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const osm = read<RawOsm>('public/data/nust-full.geojson');
const merge = read<TopoMergeFile>('public/data/topo-merge.json');
const trees = read<TopoTreesFile>('public/data/topo-trees.json');
const terrainFile = read<TerrainFile>('public/data/topo-terrain.json');
const base = buildCampus({ osm, landmarks });
const none: TopoOverrides = { layers: {}, excludeUpstream: [], features: {} };
const merged = applyTopoMerge(base, merge, trees, none);

describe('topo merge: provenance and safety', () => {
  it('returns the OSM data untouched when there is no merge file', () => {
    expect(applyTopoMerge(base, null)).toBe(base);
  });
  it('never mutates the OSM-derived data it is given', () => {
    const n = base.buildings.length;
    applyTopoMerge(base, merge, trees, none);
    expect(base.buildings.length).toBe(n);
    expect(base.buildings.every((b) => !b.provisional || b.id.includes('-prov'))).toBe(true);
  });
  it('every merged feature carries its source', () => {
    const added = merged.buildings.filter((b) => b.id.startsWith('topo:'));
    expect(added.length).toBe(merge.additions.length + merge.hostels.length);
    for (const b of added) {
      expect(b.provisional).toBe(true);
      expect(b.source).toMatch(/overture|topo/);
    }
    for (const a of merge.additions) {
      expect(a.upstream.length).toBeGreaterThan(0);
      expect(['high', 'medium', 'low']).toContain(a.confidence);
    }
  });
  it('public files hold no outline from an excluded upstream (Google Open Buildings by default)', () => {
    const o = read<TopoOverrides>('data/topo-overrides.json');
    const text = JSON.stringify(merge);
    for (const u of o.excludeUpstream) expect(text).not.toContain(u);
    for (const a of merge.additions) expect(o.excludeUpstream).not.toContain(a.upstream);
  });
  it('attribution is stored with the data', () => {
    expect(merge.attribution).toContain('OpenStreetMap contributors');
    expect(merge.attribution).toContain('Overture Maps Foundation');
    expect(merge.attribution).toContain('CC BY 4.0');
  });
});

describe('topo merge: rules', () => {
  it('rule 2: added buildings do not sit on top of OSM buildings', () => {
    const osmB = base.buildings.filter((b) => !b.offCampus);
    for (const a of merge.additions) {
      const ring = a.ring.map(([x, y]) => project(x, y));
      const c = ring.reduce(
        (s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length],
        [0, 0],
      );
      const inside = osmB.some((b) => pointInRing([c[0], c[1]], b.footprint));
      expect(inside, a.id).toBe(false);
      expect(a.areaM2).toBeGreaterThanOrEqual(100);
    }
  });
  it('rule 3: hostel footprints are named only by an OSM area or point they fall inside', () => {
    for (const h of merge.hostels) {
      expect(['area', 'point']).toContain(h.via);
      expect(h.areaId).toMatch(/^(way|node|relation)\//);
      expect(h.placeName.length).toBeGreaterThan(2);
    }
  });
  it('rule 1: an exact duplicate OSM way is suppressed, the named one is kept', () => {
    const dup = merge.suppressed.find((s) => s.duplicateOf === 'way/209832719');
    expect(dup?.target).toBe('way/1364559421');
    expect(base.buildings.some((b) => b.id === 'way/1364559421')).toBe(true);
    expect(merged.buildings.some((b) => b.id === 'way/1364559421')).toBe(false);
    expect(merged.buildings.some((b) => b.id === 'way/209832719')).toBe(true);
  });
  it('rule 4: OSM keeps the geometry where Overture disagrees, and the feature is flagged', () => {
    const ghazali = merged.buildings.find((b) => b.id === 'way/209091616')!;
    const original = base.buildings.find((b) => b.id === 'way/209091616')!;
    expect(ghazali.footprint).toEqual(original.footprint);
    expect(ghazali.flags?.[0]).toMatch(/differ by/);
  });
  it('rule 5: heights are not taken from the topo data', () => {
    for (const b of merged.buildings.filter((x) => x.id.startsWith('topo:')))
      expect(b.heightSource).toBe('category default (provisional)');
    const by = (d: typeof base) => new Map(d.buildings.map((b) => [b.id, b.height]));
    const bm = by(base);
    for (const [id, h] of by(merged)) if (bm.has(id)) expect(h).toBe(bm.get(id));
  });
  it('overrides: layers and single features can be switched off', () => {
    const off = applyTopoMerge(base, merge, trees, { ...none, layers: { additions: false } });
    expect(off.buildings.length).toBeLessThan(merged.buildings.length);
    if (merge.additions.length) {
      const id = merge.additions[0].id;
      const one = applyTopoMerge(base, merge, trees, { ...none, features: { [id]: false } });
      expect(one.buildings.some((b) => b.id === `topo:${id}`)).toBe(false);
      expect(one.buildings.length).toBe(merged.buildings.length - 1);
    }
    const noTrees = applyTopoMerge(base, merge, trees, { ...none, layers: { trees: false } });
    expect(noTrees.trees.length).toBe(base.trees.length);
  });
  it('excluding an upstream removes everything that came only from it', () => {
    if (!merge.additions.length) return;
    const up = merge.additions[0].upstream;
    const o = applyTopoMerge(base, merge, trees, { ...none, excludeUpstream: [up] });
    const left = merge.additions.filter((a) => a.upstream !== up).length;
    expect(o.buildings.filter((b) => b.id.startsWith('topo:')).length).toBeLessThanOrEqual(
      left + merge.hostels.length,
    );
  });
});

describe('topo merge: roads and routing', () => {
  it('provisional roads never reduce connectivity', () => {
    const ways = (d: typeof base) => [...d.footways, ...d.roads.filter((r) => r.kind !== 'busway')];
    const g0 = buildGraph(ways(base)),
      g1 = buildGraph(ways(merged));
    expect(largestComponent(g1).size).toBeGreaterThanOrEqual(largestComponent(g0).size);
    for (const l of [...merged.roads, ...merged.footways])
      if (l.provisional) expect(l.source).toMatch(/overture/);
  });
});

describe('topo merge: trees', () => {
  it('individual trees replace the random scatter inside the topo region', () => {
    expect(trees.trees.length % 4).toBe(0);
    expect(merged.treeRegion?.length).toBeGreaterThan(0);
    const spots = scatterTrees(merged, buildObstacles(merged));
    const inRegion = spots.filter((s) =>
      merged.treeRegion!.some((r) => pointInRing([s.x, s.z], r)),
    );
    const topoCount = trees.trees.length / 4;
    // only real trees (minus those over buildings) remain in the region; no Poisson fill, avenues or frontage palms
    expect(inRegion.length).toBeLessThanOrEqual(topoCount);
    expect(inRegion.length).toBeGreaterThan(topoCount * 0.8);
    // outside the region the scatter is still there
    expect(spots.length).toBeGreaterThan(inRegion.length);
  });
  it('tree sizes come from the data', () => {
    for (let i = 0; i < trees.trees.length; i += 4) {
      expect(trees.trees[i + 2]).toBeGreaterThan(0);
      expect(trees.trees[i + 3]).toBeGreaterThan(0);
    }
  });
});

describe('utm conversion used for the georeference', () => {
  it('round-trips to well under a millimetre', () => {
    for (const [lng, lat] of [
      [72.9915, 33.643],
      [72.976, 33.634],
      [72.997, 33.654],
    ]) {
      const [e, n] = toUtm(lng, lat);
      const [lng2, lat2] = fromUtm(e, n);
      expect(Math.hypot((lng2 - lng) * 92700, (lat2 - lat) * 111000)).toBeLessThan(0.001);
    }
  });
  it('is exact on the central meridian at the equator', () => {
    const [e, n] = toUtm(75, 0);
    expect(e).toBeCloseTo(500000, 3);
    expect(n).toBeCloseTo(0, 3);
  });
});

describe('optional terrain', () => {
  afterEach(() => setTerrain(null, false));
  const t = new Terrain(terrainFile);
  it('is off by default: groundY is exactly 0 so the flat map and control-point checks are unaffected', () => {
    expect(groundY(0, 0)).toBe(0);
    expect(groundY(300, -200)).toBe(0);
    setTerrain(t, false);
    expect(groundY(100, 100)).toBe(0);
  });
  it('is relative to the origin elevation and interpolates the grid', () => {
    expect(t.heightAt(0, 0)).toBeCloseTo(0, 1);
    const { x0, z0, cell, cols, values } = terrainFile;
    expect(t.heightAt(x0 + cell * 3, z0 + cell * 2)).toBeCloseTo(values[2 * cols + 3], 6);
    const mid = t.heightAt(x0 + cell * 3.5, z0 + cell * 2);
    expect(mid).toBeCloseTo((values[2 * cols + 3] + values[2 * cols + 4]) / 2, 6);
  });
  it('clamps outside the grid and stays inside the source range', () => {
    expect(Number.isFinite(t.heightAt(-1e5, 1e5))).toBe(true);
    expect(t.min).toBeGreaterThan(-30);
    expect(t.max).toBeLessThan(30);
  });
  it('slope makes paths longer only when terrain is on', () => {
    const [x0, z0, , z1] = t.box;
    const path: [number, number][] = [
      [x0 + 100, z0 + 100],
      [x0 + 100, z1 - 100],
    ];
    const flat = Math.hypot(0, path[1][1] - path[0][1]);
    expect(pathLength3d(path)).toBeCloseTo(flat, 6);
    setTerrain(t, true);
    expect(pathLength3d(path)).toBeGreaterThanOrEqual(flat);
  });
});
