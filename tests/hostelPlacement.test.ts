import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOSTEL_PLACEMENT, HOSTEL_TEMPLATES, PLACEMENT_AREA } from '../data/hostel-placement';
import { landmarks } from '@/data/landmarks';
import { buildCampus } from '@/lib/campus';
import { pointInPolygon, polygonArea } from '@/lib/geo';
import {
  TEMPLATE_FLAG,
  applyHostelPlacement,
  areaCentroid,
  distToRing,
  placeRing,
  sampleRing,
} from '@/lib/hostelPlacement';
import type { RawOsm } from '@/lib/osm';
import { createSearch } from '@/lib/search';
import { applyTopoMerge, type TopoMergeFile, type TopoTreesFile } from '@/lib/topoMerge';
import type { Vec2 } from '@/lib/types';

const read = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const base = buildCampus({ osm: read<RawOsm>('public/data/nust-full.geojson'), landmarks });
const topo = applyTopoMerge(
  base,
  read<TopoMergeFile>('public/data/topo-merge.json'),
  read<TopoTreesFile>('public/data/topo-trees.json'),
);
const data = applyHostelPlacement(topo);
const area = data.bare.find((a) => a.id === PLACEMENT_AREA.id)!.points;
const copy = (k: string) => data.buildings.find((b) => b.id === `template:${k}`)!;
const tpl = (k: 'ghazali-1' | 'ghazali-2') =>
  base.buildings.find((b) => b.osmId === HOSTEL_TEMPLATES[k].osmId)!;
const edges = (r: Vec2[]) =>
  r.map((p, i) => Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]));
/** Smallest distance between a footprint and a line or ring (0 when they cross). */
const gap = (fp: Vec2[], other: Vec2[], closed = true) => {
  const pts = sampleRing(fp, 0.5);
  if (closed && pts.some((p) => pointInPolygon(p, [other]))) return 0;
  const o = closed ? other : other.slice(0, -1);
  let d = Infinity;
  for (const p of pts)
    for (let i = 0; i < (closed ? other.length : other.length - 1); i++) {
      const a = other[i],
        b = other[(i + 1) % other.length];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
    }
  return o.length ? d : Infinity;
};

describe('template-based hostels (data/hostel-placement.ts)', () => {
  it('copies the Ghazali footprints exactly: same vertices, edge lengths, area and holes', () => {
    for (const [k, t] of [
      ['rehmat', 'ghazali-1'],
      ['razi-1', 'ghazali-2'],
    ] as const) {
      const c = copy(k),
        g = tpl(t);
      expect(c.footprint.length).toBe(g.footprint.length);
      const a = edges(c.footprint),
        b = edges(g.footprint);
      a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6));
      expect(Math.abs(polygonArea(c.footprint))).toBeCloseTo(Math.abs(polygonArea(g.footprint)), 3);
      expect(c.holes.length).toBe(g.holes.length);
    }
  });
  it('never alters the Ghazali buildings', () => {
    for (const t of ['ghazali-1', 'ghazali-2'] as const) {
      const id = tpl(t).id;
      expect(data.buildings.find((b) => b.id === id)!.footprint).toEqual(
        topo.buildings.find((b) => b.id === id)!.footprint,
      );
    }
  });
  it('mirroring keeps the shape (reversed winding) and rotation is clockwise from above', () => {
    const sq: Vec2[] = [
      [0, 0],
      [2, 0],
      [2, -1],
      [0, -1],
    ];
    const piv = areaCentroid(sq);
    expect(piv[0]).toBeCloseTo(1);
    expect(piv[1]).toBeCloseTo(-0.5);
    // a point north of the pivot (z negative) turns to the east at 90 degrees
    const [p] = placeRing([[1, -10.5]], piv, [0, 0], 90, false);
    expect(p[0]).toBeCloseTo(10);
    expect(p[1]).toBeCloseTo(0);
    const m = placeRing(sq, piv, [0, 0], 0, true);
    expect(Math.sign(polygonArea(m))).toBe(Math.sign(polygonArea(sq)));
  });
  it('both copies fit inside Razi Hostel Area (nothing outside, no scaling)', () => {
    for (const k of ['rehmat', 'razi-1']) {
      const p = data.places.find((x) => x.placement?.key === k)!;
      expect(p.placement!.outsideM).toBe(0);
      for (const q of sampleRing(copy(k).footprint, 0.5))
        expect(pointInPolygon(q, [area])).toBe(true);
    }
  });
  it('keeps clear gaps: from each other, the loop driveway, parking, footpaths, play ground and court', () => {
    const reh = copy('rehmat').footprint,
      razi = copy('razi-1').footprint;
    expect(gap(reh, razi)).toBeGreaterThan(5);
    const drive = data.roads.filter((r) => r.id === 'way/1213687790' || r.id === 'way/1213687789');
    expect(drive).toHaveLength(2);
    const park = data.parking.find((a) => a.id === 'way/1481128908')!;
    const courts = data.pitches.filter(
      (a) => a.id === 'way/1256473184' || a.id === 'way/209856437',
    );
    expect(courts).toHaveLength(2);
    const foot = data.footways.filter((f) => ['way/1256471914', 'way/1256471915'].includes(f.id));
    for (const fp of [reh, razi]) {
      // driveway: 3 m half-width, then at least 1.5 m of clear ground
      for (const d of drive) expect(gap(fp, d.points, false)).toBeGreaterThan(4.5);
      expect(gap(fp, park.points)).toBeGreaterThan(1.5);
      for (const c of courts) expect(gap(fp, c.points)).toBeGreaterThan(1.5);
      for (const f of foot) expect(gap(fp, f.points, false)).toBeGreaterThan(1.5);
    }
  });
  it('places: names, aliases, card facts, approximate entrance, template flag', () => {
    const reh = data.places.find((p) => p.id === 'rehmat-hostel')!;
    const razi = data.places.find((p) => p.id === 'razi-1')!;
    for (const p of [reh, razi]) {
      expect(p).toMatchObject({
        category: 'hostel',
        verified: false,
        description: 'Info coming soon',
        levels: 4,
        levelsEstimated: true,
        entranceApprox: true,
        photoSlot: true,
        flat: false,
        source: 'template',
      });
      expect(p.resolvedHeight).toBeCloseTo(12);
      expect(pointInPolygon(p.pos, [p.footprints[0]])).toBe(true);
    }
    expect(reh.name).toBe('Rehmat Hostel');
    expect(razi.name).toBe('Razi 1');
    expect(copy('rehmat').flags![0]).toContain(TEMPLATE_FLAG);
    expect(copy('rehmat').roofType).toBe('hostel-template');
    const al = (p: typeof reh) => p.aliases.map((a) => a.toLowerCase());
    for (const a of ['rehmat', 'rahmat']) expect(al(reh)).toContain(a);
    for (const a of ['razi', 'razi 1', 'razi hostel', 'razi hostels'])
      expect(al(razi)).toContain(a);
  });
  it('search: rehmat / rahmat find Rehmat Hostel first; razi / razi 1 find Razi 1 first', () => {
    const idx = createSearch(data.places.filter((p) => !p.offCampus));
    const top = (q: string) => idx.query(q)[0]?.id;
    expect(top('rehmat')).toBe('rehmat-hostel');
    expect(top('rahmat')).toBe('rehmat-hostel');
    expect(top('razi')).toBe('razi-1');
    expect(top('razi 1')).toBe('razi-1');
  });
  it('the entrance faces the loop driveway side (north-east, within 45 degrees)', () => {
    for (const k of ['rehmat', 'razi-1']) {
      const d = data.places.find((p) => p.placement?.key === k)!.placement!.entranceDir;
      // scene bearing: x east, z south -> clockwise from north
      const brg = ((Math.atan2(d[0], -d[1]) * 180) / Math.PI + 360) % 360;
      expect(Math.abs(brg - 55)).toBeLessThan(45);
    }
  });
  it('the area keeps its dashed boundary and a flat place; its label moves to the edge, off the buildings', () => {
    const a = data.places.find((p) => p.osmId === PLACEMENT_AREA.osmId)!;
    expect(a).toMatchObject({ flat: true, footprints: [], areaLabel: true });
    expect(pointInPolygon(a.pos, [area])).toBe(true);
    expect(distToRing(a.pos, area)).toBeLessThanOrEqual(8);
    for (const k of ['rehmat', 'razi-1'])
      expect(pointInPolygon(a.pos, [copy(k).footprint])).toBe(false);
    expect(data.buildings.some((b) => b.placeId === a.id)).toBe(false);
  });
  it('placement values are plain, editable data', () => {
    for (const v of Object.values(HOSTEL_PLACEMENT)) {
      expect(v.mirror).toBe(false);
      expect(v.centre[0]).toBeGreaterThan(33.6);
      expect(v.centre[1]).toBeGreaterThan(72.9);
    }
  });
});
