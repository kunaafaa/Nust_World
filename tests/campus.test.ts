import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landmarks } from '@/data/landmarks';
import { buildCampus, parseHeight, resolveHeight } from '@/lib/campus';
import type { RawOsm } from '@/lib/osm';

const osm = JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm;
const data = buildCampus({ osm, landmarks });

describe('nust-full pipeline', () => {
  it('prints merge report', () => {
    const r = data.report;
    console.log(
      JSON.stringify({
        ...r,
        footprintsWithoutLandmark: r.footprintsWithoutLandmark.map((x) => x.name),
        moved: r.moved.length,
        needsOutline: r.needsOutline.length,
      }),
    );
    expect(r.landmarks).toBe(72);
  });
  it('point landmarks (OSM nodes) become one flat, tappable place with their menu', () => {
    const cl = data.places.filter((p) => /coffee lounge/i.test(p.name));
    expect(cl).toHaveLength(1); // the landmark replaces the generic cafe point
    expect(cl[0]).toMatchObject({
      id: 'coffee-lounge-8601',
      source: 'landmark',
      category: 'food',
      menuId: 'coffee-lounge',
      point: true,
      flat: true,
      footprints: [],
    });
    expect(cl[0].aliases).toContain('coffee lounge');
    // every other landmark is unchanged: none is a point
    expect(data.places.filter((p) => p.point).map((p) => p.id)).toEqual(['coffee-lounge-8601']);
  });
  it('matches every landmark by osmId', () => {
    expect(data.report.noFootprint).toEqual([]);
    expect(data.report.matched).toBe(70);
  });
  it('removes the joke entry and hides off-campus places by flag', () => {
    expect(data.places.find((p) => p.id.startsWith('sada-walon'))).toBeUndefined();
    expect(data.buildings.find((b) => b.name === '__removed__')).toBeUndefined();
    expect(data.places.filter((p) => p.offCampus).length).toBe(12);
  });
  it('numeric unit labels are not places', () => {
    expect(data.places.some((p) => /^\d+$/.test(p.name))).toBe(false);
    expect(data.buildings.filter((b) => b.unit).length).toBe(8);
  });
  it('keeps courtyard holes from multipolygon relations', () => {
    expect(data.buildings.some((b) => b.holes.length > 0)).toBe(true);
  });
  it('adds OSM-only hostels and NBS as places', () => {
    const ids = data.places.map((p) => p.name.toLowerCase());
    for (const n of [
      'zakariya hostel',
      'hajveri hostel',
      'ayesha hostel',
      'fatima ii',
      'nust business school',
    ])
      expect(ids).toContain(n);
  });
  it('hostel areas are never extruded: dashed boundary + a flat, searchable area place', () => {
    const names = data.report.provisional.map((p) => p.name).sort();
    expect(names).toEqual(['Razi Hostel Area']);
    expect(data.buildings.filter((b) => b.provisional).length).toBe(0);
    const areas = data.bare.filter((a) => a.kind === 'hostelArea').map((a) => a.name);
    expect(areas).toEqual(
      expect.arrayContaining([
        'Razi Hostel Area',
        'Ghazali Hostel Area',
        'Attar Hostel Area',
        'Rumi Hostel Area',
        'Fatima Hostels Area',
      ]),
    );
    const razi = data.places.find((p) => p.id === 'prov-razi-hostel')!;
    expect(razi).toMatchObject({ flat: true, footprints: [], category: 'hostel', verified: false });
    const al = razi.aliases.map((a) => a.toLowerCase());
    for (const a of ['rehmat', 'rahmat', 'razi', 'razi 1', 'razi hostel', 'razi hostels'])
      expect(al).toContain(a);
  });
  it('alias variants (Zakaria, Rahmat, Salon)', () => {
    const z = data.places.find((p) => /zakariya/i.test(p.name))!;
    expect(z.aliases.map((a) => a.toLowerCase())).toContain('zakaria hostel');
    const salon = data.places.find((p) => p.name === 'Boys salon')!;
    expect(salon.aliases.map((a) => a.toLowerCase())).toContain('boys saloon');
  });
  it('heights: heights.ts > landmarks > osm > default; units parsed', () => {
    expect(resolveHeight(209141896, {}, 'admin', { levels: 4, heightM: 16 }).source).toBe(
      'landmarks.ts heightM',
    );
    expect(resolveHeight(1, { height: '30ft' }, 'other').h).toBeCloseTo(9.144);
    expect(resolveHeight(1, {}, 'hostel')).toMatchObject({ h: 14, estimated: true });
    expect(resolveHeight(1, {}, 'academic', { levels: 3, heightM: 30 })).toMatchObject({
      h: 3 * 3.4,
      source: expect.stringContaining('implausible'),
    });
    expect(resolveHeight(1, { height: '30', 'building:levels': '1' }, 'academic').h).toBeCloseTo(
      3.4,
    );
    expect(parseHeight('0')).toBeUndefined();
    expect(parseHeight('40 feet')).toBeCloseTo(12.19, 1);
  });
});
