import { EXTRA_NAME_DENYLIST, HIDDEN_LANDMARK_IDS, SEARCH_HINTS } from '@/data/extras';
import { DEFAULT_FLOOR_HEIGHT_M, HEIGHTS, type RoofType } from '@/data/heights';
import { nameVariants } from './aliases';
import { centroid, dist, insetRing, pointInPolygon, polygonArea, polylabel, project } from './geo';
import { parseHeight, parseOsm, type OsmFeature, type RawOsm } from './osm';
import type {
  Area,
  BuildingShape,
  CampusData,
  Category,
  DataReport,
  LandmarkInput,
  Place,
  PointFeature,
  Polyline,
  Vec2,
} from './types';

export { parseHeight };
export const METRES_PER_LEVEL = DEFAULT_FLOOR_HEIGHT_M;
export const MAX_M_PER_FLOOR = 6;

export const ROAD_KINDS = new Set([
  'trunk',
  'trunk_link',
  'primary',
  'secondary',
  'secondary_link',
  'tertiary',
  'residential',
  'service',
  'unclassified',
  'living_street',
  'busway',
]);
export const FOOT_KINDS = new Set(['footway', 'path', 'steps', 'pedestrian', 'track', 'cycleway']);
const GREEN_LANDUSE =
  /^(grass|forest|meadow|orchard|farmland|conservation|greenfield|recreation_ground)$/;
const BARE_LANDUSE = /^(residential|commercial|retail|industrial|construction|brownfield)$/;
const HOSTEL_WORDS =
  /hostel|ghazali|attar|liaquat|rumi|razi|fatima|rehmat|rahmat|zakar|hajveri|ayesha|khadija|zainab|amna|villas/i;

/** Used only when no other source gives a height. Reported as "category default" in debug. */
export const DEFAULT_HEIGHT: Record<Category, number> = {
  academic: 12,
  hostel: 14,
  food: 5,
  prayer: 10,
  sports: 8,
  admin: 8,
  gate: 4,
  parking: 0,
  medical: 8,
  atm: 3,
  other: 8,
};

export const isUnitLabel = (name?: string) => !!name && /^\d+$/.test(name.trim());
const latin = (s: string) => /[a-z]/i.test(s) && !/[؀-ۿ]/.test(s);
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Deterministic 0..1 hash so anything "random" is identical on every load. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const heightsByOsm = new Map(HEIGHTS.map((h) => [h.osmId, h]));

export interface ResolvedHeight {
  h: number;
  source: string;
  roof: RoofType;
  estimated: boolean;
}

/** heights.ts > landmarks.ts > OSM tags > category default. */
export function resolveHeight(
  osmId: number,
  tags: Record<string, string>,
  category: Category,
  lm?: Pick<LandmarkInput, 'heightM' | 'levels'>,
): ResolvedHeight {
  const he = heightsByOsm.get(osmId);
  const roof: RoofType = he?.roofType ?? (category === 'prayer' ? 'dome-center' : 'flat');
  if (he?.floors)
    return {
      h: he.floors * (he.floorHeightM ?? DEFAULT_FLOOR_HEIGHT_M),
      source: 'heights.ts',
      roof,
      estimated: false,
    };
  // A height implying more than MAX_M_PER_FLOOR per floor is treated as an OSM/data error: use levels instead.
  if (lm?.heightM && lm.levels && lm.heightM / lm.levels > MAX_M_PER_FLOOR)
    return {
      h: lm.levels * DEFAULT_FLOOR_HEIGHT_M,
      source: 'landmarks.ts levels (heightM implausible, ignored)',
      roof,
      estimated: false,
    };
  if (lm?.heightM) return { h: lm.heightM, source: 'landmarks.ts heightM', roof, estimated: false };
  if (lm?.levels)
    return {
      h: lm.levels * DEFAULT_FLOOR_HEIGHT_M,
      source: 'landmarks.ts levels',
      roof,
      estimated: false,
    };
  const oh = parseHeight(tags.height);
  const olv = parseFloat(tags['building:levels'] ?? '');
  if (oh && olv > 0 && oh / olv > MAX_M_PER_FLOOR)
    return {
      h: olv * DEFAULT_FLOOR_HEIGHT_M,
      source: 'osm levels (height implausible, ignored)',
      roof,
      estimated: false,
    };
  if (oh) return { h: oh, source: 'osm height', roof, estimated: false };
  const lv = parseFloat(tags['building:levels'] ?? '');
  if (lv > 0)
    return { h: lv * DEFAULT_FLOOR_HEIGHT_M, source: 'osm levels', roof, estimated: false };
  return { h: DEFAULT_HEIGHT[category] ?? 8, source: 'category default', roof, estimated: true };
}

export function guessCategory(name: string, t: Record<string, string>): Category {
  const n = name.toLowerCase();
  if (t.amenity === 'parking' || /parking/.test(n)) return 'parking';
  if (/gate/.test(n) || t.barrier === 'gate') return 'gate';
  if (/masjid|mosque|prayer/.test(n)) return 'prayer';
  if (HOSTEL_WORDS.test(n)) return 'hostel';
  if (
    /mess|cafe|café|canteen|juice|shawarma|lounge|jango|retro/.test(n) ||
    /cafe|restaurant|fast_food/.test(t.amenity ?? '')
  )
    return 'food';
  if (/ground|court|pool|gym|pitch|sports|nets|playground|rink|club|stadium/.test(n) || t.leisure)
    return 'sports';
  if (/atm|bank/.test(n) || /atm|bank/.test(t.amenity ?? '')) return 'atm';
  if (/hospital|clinic|medical/.test(n)) return 'medical';
  if (/office|admin|auditorium|exam|rector/.test(n)) return 'admin';
  if (/school|institute|centre|center|library|block|nit\b|nbs|business|iese/.test(n))
    return 'academic';
  return 'other';
}

export interface CampusInputs {
  osm: RawOsm;
  landmarks: LandmarkInput[];
}

export function buildCampus({ osm, landmarks }: CampusInputs): CampusData {
  const feats = parseOsm(osm);
  const raw: BuildingShape[] = [];
  const roads: Polyline[] = [];
  const footways: Polyline[] = [];
  const parking: Area[] = [],
    pitches: Area[] = [],
    green: Area[] = [],
    water: Area[] = [],
    bare: Area[] = [],
    plazas: Area[] = [];
  const points: PointFeature[] = [],
    benches: PointFeature[] = [],
    trees: PointFeature[] = [];
  const flatCands: { name: string; cat: Category; pos: Vec2; osmId: number }[] = [];
  const hostelAreas: OsmFeature[] = [];
  const hostelPoints: OsmFeature[] = [];
  const osmBuildings: { f: OsmFeature; b: BuildingShape }[] = [];
  const hostelPolys: OsmFeature[] = [];

  for (const f of feats) {
    const t = f.tags;
    const g = f.geom;
    const nm = t.name ?? t['name:en'];
    if (g.kind === 'point') {
      points.push({
        id: f.id,
        kind: t.amenity ?? t.barrier ?? t.entrance ?? t.natural ?? 'node',
        pos: g.p,
        name: nm,
      });
      if (t.natural === 'tree') trees.push({ id: f.id, kind: t.species ?? 'tree', pos: g.p });
      else if (t.amenity === 'bench') benches.push({ id: f.id, kind: 'bench', pos: g.p });
      else if (nm && latin(nm)) {
        if (t.amenity || t.barrier === 'gate' || t.leisure || /gate/i.test(nm))
          flatCands.push({ name: nm, cat: guessCategory(nm, t), pos: g.p, osmId: f.num });
        else if (HOSTEL_WORDS.test(nm)) hostelPoints.push(f);
      } else if (t.amenity === 'atm' || t.atm === 'yes') {
        flatCands.push({
          name: t.operator ? `${t.operator} ATM` : 'ATM',
          cat: 'atm',
          pos: g.p,
          osmId: f.num,
        });
      }
      continue;
    }
    if (g.kind === 'line') {
      if (!t.highway) continue;
      const line: Polyline = {
        id: f.id,
        kind: t.highway,
        points: g.pts,
        name: nm,
        oneway: t.oneway === 'yes',
        roundabout: t.junction === 'roundabout',
        surface: t.surface,
        tunnel: t.tunnel === 'yes' || t.covered === 'yes',
        bridge: t.bridge === 'yes',
      };
      if (ROAD_KINDS.has(t.highway)) roads.push(line);
      else if (FOOT_KINDS.has(t.highway)) footways.push(line);
      continue;
    }
    const [outer, ...holes] = g.rings;
    const area: Area = {
      id: f.id,
      kind: '',
      points: outer,
      holes,
      name: nm,
      sport: t.sport,
      surface: t.surface,
    };
    const c = centroid(outer);
    const keepName = !!nm && !EXTRA_NAME_DENYLIST.test(nm);
    if (t.building) {
      if (Math.abs(polygonArea(outer)) < 12) continue;
      const b: BuildingShape = {
        id: f.id,
        osmId: f.num,
        name: nm,
        footprint: outer,
        holes,
        height: 8,
        heightSource: 'category default',
        roofType: 'flat',
      };
      raw.push(b);
      osmBuildings.push({ f, b });
    } else if (t.tourism === 'hostel') {
      hostelPolys.push(f); // decided after the loop: outline vs. container area
    } else if (t.amenity === 'parking') {
      parking.push({ ...area, kind: 'parking' });
      if (keepName) flatCands.push({ name: nm!, cat: 'parking', pos: c, osmId: f.num });
    } else if (
      t.leisure &&
      /^(pitch|playground|sports_centre|track|swimming_pool|fitness_centre|horse_riding)$/.test(
        t.leisure,
      )
    ) {
      pitches.push({ ...area, kind: t.leisure });
      if (keepName) flatCands.push({ name: nm!, cat: 'sports', pos: c, osmId: f.num });
    } else if (t.natural === 'water' || t.water) {
      water.push({ ...area, kind: 'water' });
      if (keepName) flatCands.push({ name: nm!, cat: 'other', pos: c, osmId: f.num });
    } else if (t.natural === 'wetland') {
      water.push({ ...area, kind: 'wetland' });
    } else if (t.landuse === 'residential' && nm && /hostel/i.test(nm)) {
      hostelAreas.push(f);
      bare.push({ ...area, kind: 'residential' });
    } else if (
      t.leisure === 'park' ||
      t.leisure === 'garden' ||
      /^(wood|scrub|grassland|heath)$/.test(t.natural ?? '') ||
      GREEN_LANDUSE.test(t.landuse ?? '')
    ) {
      green.push({ ...area, kind: t.landuse ?? t.leisure ?? t.natural });
      if (keepName && /convocation|ground|lawn/i.test(nm!))
        flatCands.push({
          name: nm!,
          cat: /ground/i.test(nm!) ? 'sports' : 'other',
          pos: c,
          osmId: f.num,
        });
    } else if (BARE_LANDUSE.test(t.landuse ?? '')) {
      bare.push({ ...area, kind: t.landuse });
      if (nm && latin(nm) && /mess/i.test(nm))
        flatCands.push({ name: nm, cat: 'food', pos: c, osmId: f.num });
    } else if (t.landuse === 'meadow') {
      green.push({ ...area, kind: 'meadow' });
      if (keepName) flatCands.push({ name: nm!, cat: 'sports', pos: c, osmId: f.num });
    } else if (t.landuse === 'open feld' && nm) {
      green.push({ ...area, kind: 'open_field' });
      flatCands.push({ name: nm, cat: 'sports', pos: c, osmId: f.num });
    } else if (t.surface && /paving|paved|concrete|brick|sett/.test(t.surface)) {
      plazas.push({ ...area, kind: 'plaza' });
    } else if (nm && latin(nm) && /gate/i.test(nm)) {
      flatCands.push({ name: nm, cat: 'gate', pos: c, osmId: f.num });
    } else if (/cafe|restaurant|fast_food/.test(t.amenity ?? '') && nm) {
      flatCands.push({ name: nm, cat: 'food', pos: c, osmId: f.num });
    }
  }

  // ── tourism=hostel polygons: a real outline unless it contains other hostels (then it is just an area) ──
  const hostelCentres: { pos: Vec2; id: string }[] = [
    ...osmBuildings
      .filter(({ f }) => HOSTEL_WORDS.test(f.tags.name ?? ''))
      .map(({ f, b }) => ({ pos: centroid(b.footprint), id: f.id })),
    ...hostelPolys.map((f) => ({
      pos: centroid((f.geom as { rings: Vec2[][] }).rings[0]),
      id: f.id,
    })),
  ];
  const containers: string[] = [];
  for (const f of hostelPolys) {
    if (f.geom.kind !== 'poly') continue;
    const [outer, ...holes] = f.geom.rings;
    const isContainer = hostelCentres.some((c) => c.id !== f.id && pointInPolygon(c.pos, [outer]));
    if (isContainer) {
      bare.push({ id: f.id, kind: 'residential', points: outer, holes, name: f.tags.name });
      containers.push(f.tags.name ?? f.id);
      continue;
    }
    const b: BuildingShape = {
      id: f.id,
      osmId: f.num,
      name: f.tags.name,
      footprint: outer,
      holes,
      height: 8,
      heightSource: 'category default',
      roofType: 'flat',
    };
    raw.push(b);
    osmBuildings.push({ f, b });
  }

  // ── Landmarks: match by osmId ──
  const byOsm = new Map<number, BuildingShape>();
  const featByOsm = new Map<number, OsmFeature>();
  for (const { f, b } of osmBuildings) {
    byOsm.set(b.osmId, b);
    featByOsm.set(b.osmId, f);
  }
  const places: Place[] = [];
  const claimed = new Set<number>();
  const hidden = new Set(HIDDEN_LANDMARK_IDS);
  const noFootprint: string[] = [];
  const moved: { id: string; metres: number }[] = [];
  const heightSources: Record<string, number> = {};
  let matched = 0,
    hiddenOff = 0;

  for (const lm of landmarks) {
    const b = byOsm.get(lm.osmId);
    claimed.add(lm.osmId);
    if (hidden.has(lm.id)) {
      if (b) b.name = '__removed__';
      continue;
    }
    const f = featByOsm.get(lm.osmId);
    const r = resolveHeight(lm.osmId, f?.tags ?? {}, lm.category, lm);
    if (isUnitLabel(lm.name)) {
      // room/unit label: part of a hostel block, never a place
      if (b) {
        matched++;
        b.unit = true;
        b.height = r.h;
        b.heightSource = r.source;
        b.name = undefined;
      }
      continue;
    }
    let pos = project(lm.lng, lm.lat);
    if (b) {
      matched++;
      const rings = [b.footprint, ...b.holes];
      if (!pointInPolygon(pos, rings)) {
        const to = polylabel(rings, 0.3);
        moved.push({ id: lm.id, metres: Math.round(dist(pos, to) * 10) / 10 });
        pos = to;
      }
      Object.assign(b, {
        placeId: lm.id,
        height: r.h,
        heightSource: r.source,
        roofType: r.roof,
        offCampus: !!lm.offCampus,
        name: lm.name,
      });
    } else noFootprint.push(lm.id);
    if (lm.offCampus) hiddenOff++;
    heightSources[r.source] = (heightSources[r.source] ?? 0) + 1;
    const aliases = new Set(
      [
        lm.shortName,
        lm.name,
        lm.officialName ?? '',
        ...lm.aliases,
        ...(SEARCH_HINTS[lm.osmId] ?? []),
      ].filter(Boolean),
    );
    for (const a of [...aliases]) for (const v of nameVariants(a)) aliases.add(v);
    places.push({
      id: lm.id,
      source: 'landmark',
      osmId: lm.osmId,
      name: lm.name,
      shortName: lm.shortName,
      category: lm.category,
      aliases: [...aliases],
      description: lm.description,
      menuId: lm.menuId,
      verified: lm.verified,
      offCampus: !!lm.offCampus,
      levels: lm.levels,
      heightM: lm.heightM,
      entrance: lm.entrance ? project(lm.entrance.lng, lm.entrance.lat) : null,
      pos,
      footprints: b ? [b.footprint] : [],
      resolvedHeight: r.h,
      heightSource: r.source,
      heightEstimated: r.estimated && !!b,
      flat: false,
    });
  }
  const hasPlace = (name: string, near?: Vec2, within = 80) =>
    places.some((p) => norm(p.name) === norm(name) && (!near || dist(p.pos, near) < within));

  // ── Named OSM buildings that landmarks.ts does not list ──
  let osmPlaces = 0;
  const footprintsWithoutLandmark: { id: string; name: string }[] = [];
  for (const { f, b } of osmBuildings) {
    if (claimed.has(b.osmId) || b.name === '__removed__') continue;
    const nm = f.tags.name ?? f.tags['name:en'];
    const cat = nm ? guessCategory(nm, f.tags) : 'other';
    const r = resolveHeight(b.osmId, f.tags, cat);
    b.height = r.h;
    b.heightSource = r.source;
    b.roofType = r.roof;
    if (!nm || !latin(nm) || isUnitLabel(nm)) {
      b.name = undefined;
      continue;
    }
    footprintsWithoutLandmark.push({ id: f.id, name: nm });
    const pos = polylabel([b.footprint, ...b.holes], 0.5);
    b.placeId = `osm-${slug(nm)}-${b.osmId}`;
    places.push({
      id: b.placeId,
      source: 'osm',
      osmId: b.osmId,
      name: nm,
      shortName: nm.replace(/^nust\s+/i, '').replace(/\s*\(.*\)$/, ''),
      category: cat,
      aliases: [nm, ...nameVariants(nm)],
      description: 'Info coming soon',
      verified: false,
      offCampus: false,
      pos,
      footprints: [b.footprint],
      resolvedHeight: r.h,
      heightSource: r.source,
      heightEstimated: r.estimated,
      flat: false,
      levels: parseFloat(f.tags['building:levels'] ?? '') || undefined,
    });
    osmPlaces++;
    heightSources[r.source] = (heightSources[r.source] ?? 0) + 1;
  }
  for (const b of raw)
    if (!b.placeId && !b.unit) b.name = b.name === '__removed__' ? b.name : undefined;

  // ── Provisional hostel blocks (area polygon only; no building outline in OSM) ──
  const provisional: DataReport['provisional'] = [];
  const needsOutline: string[] = [];
  const consumedPoints = new Set<string>();
  for (const f of hostelAreas) {
    if (f.geom.kind !== 'poly') continue;
    const outer = f.geom.rings[0];
    const nm = (f.tags.name ?? '').replace(/\s+area$/i, '');
    if (hasPlace(nm)) continue;
    const inside = hostelCentres.filter((c) => pointInPolygon(c.pos, [outer]));
    if (inside.length) {
      needsOutline.push(
        `${nm} (area ${f.id}): ${inside.length} hostel outline(s) mapped inside; other hostels in this area may be unmapped`,
      );
      continue;
    }
    const ring = insetRing(outer, 3) ?? outer;
    const id = `prov-${slug(nm)}`;
    const r = resolveHeight(f.num, {}, 'hostel');
    const aliases = new Set([nm, ...nameVariants(nm)]);
    for (const p of hostelPoints) {
      if (p.geom.kind === 'point' && pointInPolygon(p.geom.p, [outer])) {
        const pn = p.tags.name!;
        aliases.add(pn);
        nameVariants(pn).forEach((v) => aliases.add(v));
        consumedPoints.add(p.id);
      }
    }
    raw.push({
      id: `${f.id}-prov`,
      osmId: f.num,
      name: nm,
      footprint: ring,
      holes: [],
      height: r.h,
      heightSource: 'category default (provisional)',
      roofType: 'flat',
      placeId: id,
      provisional: true,
    });
    places.push({
      id,
      source: 'provisional',
      osmId: f.num,
      name: nm,
      shortName: nm,
      category: 'hostel',
      aliases: [...aliases],
      description: 'Info coming soon',
      verified: false,
      offCampus: false,
      pos: polylabel([ring], 0.5),
      footprints: [ring],
      resolvedHeight: r.h,
      heightSource: 'category default (provisional)',
      heightEstimated: true,
      flat: false,
      provisional: true,
    });
    provisional.push({ id, name: nm, areaM2: Math.round(Math.abs(polygonArea(ring))) });
    needsOutline.push(`${nm} (area ${f.id}): provisional block drawn from the area polygon`);
  }
  for (const p of hostelPoints) {
    if (consumedPoints.has(p.id) || p.geom.kind !== 'point') continue;
    const nm = p.tags.name!;
    if (hasPlace(nm)) continue;
    places.push({
      id: `pt-${slug(nm)}-${p.num}`,
      source: 'extra',
      osmId: p.num,
      name: nm,
      shortName: nm,
      category: 'hostel',
      aliases: [nm, ...nameVariants(nm)],
      description: 'Info coming soon',
      verified: false,
      offCampus: false,
      pos: p.geom.p,
      footprints: [],
      resolvedHeight: 0,
      heightSource: 'n/a',
      heightEstimated: false,
      flat: true,
      needsOutline: true,
    });
    needsOutline.push(`${nm} (point ${p.id}): only a point in OSM, no outline`);
  }

  // ── Flat named features (gates, grounds, parking, cafes, lake…) ──
  let extraPlaces = 0;
  const flatPlaces: Place[] = [];
  for (const c of flatCands) {
    if (EXTRA_NAME_DENYLIST.test(c.name) || !latin(c.name) || c.name.length < 3) continue;
    if (hasPlace(c.name, c.pos)) continue;
    if (
      places.some(
        (p) =>
          p.source !== 'extra' && dist(p.pos, c.pos) < 25 && norm(p.name).includes(norm(c.name)),
      )
    )
      continue;
    if (
      flatPlaces.some((p) => p.name === c.name && p.category === c.cat && dist(p.pos, c.pos) < 120)
    )
      continue;
    flatPlaces.push({
      id: `x-${slug(c.name)}-${c.osmId}`,
      source: 'extra',
      osmId: c.osmId,
      name: c.name,
      shortName: c.name.replace(/^NUST\s+/i, ''),
      category: c.cat,
      aliases: [c.name, ...nameVariants(c.name)],
      description: 'Info coming soon',
      verified: false,
      offCampus: false,
      pos: c.pos,
      footprints: [],
      resolvedHeight: 0,
      heightSource: 'n/a',
      heightEstimated: false,
      flat: true,
    });
    extraPlaces++;
  }

  const buildings = raw.filter((b) => b.name !== '__removed__');
  const report: DataReport = {
    landmarks: landmarks.length,
    matched,
    noFootprint,
    footprintsWithoutLandmark,
    hiddenOffCampus: hiddenOff,
    extraPlaces,
    osmPlaces,
    provisional,
    needsOutline,
    moved,
    heightSources,
    timestamp: osm.timestamp,
  };
  return {
    buildings,
    roads,
    footways,
    parking,
    pitches,
    green,
    water,
    bare,
    plazas,
    points,
    benches,
    trees,
    places: [...places, ...flatPlaces],
    report,
  };
}
