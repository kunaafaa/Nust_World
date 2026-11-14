/**
 * Topo merge: applies the output of scripts/build-topo-merge.ts on top of the OSM-derived CampusData.
 * Non-destructive: nust-full.geojson and landmarks.ts are never edited; every merged feature carries its provenance;
 * layers and single features can be switched off in data/topo-overrides.json (or all at once with ?topo=off).
 *
 * Sources: Overture Maps Foundation (ODbL, buildings and roads), cross-checked against the TopoExport files.
 * Terrain/canopy (CC BY 4.0, per the export licence files) feed the tree and terrain layers.
 */
import overridesJson from '../../data/topo-overrides.json';
import { DEFAULT_FLOOR_HEIGHT_M, HEIGHTS } from '../data/heights';
import { GLOBAL_OFFSET } from './config';
import { nameVariants } from './aliases';
import { DEFAULT_HEIGHT, FOOT_KINDS, ROAD_KINDS } from './campus';
import { polylabel, project as projectRaw } from './geo';
import type { Area, BuildingShape, CampusData, Place, PointFeature, Polyline, Vec2 } from './types';

type LL = [number, number];

export interface MergeBuilding {
  id: string;
  ring: LL[];
  /** 'overture' (direct download) or 'topo' (only in the export) */
  source: string;
  /** Upstream dataset(s) Overture took the outline from */
  upstream: string;
  confidence: 'high' | 'medium' | 'low';
  areaM2: number;
}
export interface MergeHostel extends MergeBuilding {
  placeId: string;
  placeName: string;
  /** area = inside an OSM hostel area polygon; point = contains a named OSM point */
  via: 'area' | 'point';
  areaId: string;
  /** Other outlines of the same group exist only in an excluded upstream (e.g. Google Open Buildings) */
  incomplete?: boolean;
}
export interface MergeRoad {
  id: string;
  cls: string;
  name?: string;
  upstream: string;
  pts: LL[];
  snapped: number;
}
export interface TopoMergeFile {
  version: 1;
  generated: string;
  overtureRelease: string;
  attribution: string;
  /** Rings of the topo export frames: where individual trees replace the random scatter */
  region: LL[][];
  additions: MergeBuilding[];
  replacements: { target: string; parts: LL[][]; reason: string; iou: number; source: string }[];
  /** Exact duplicate OSM ways (same outline): the copy without a name/place is hidden */
  suppressed: { target: string; duplicateOf: string; reason: string }[];
  hostels: MergeHostel[];
  flags: { id: string; reason: string }[];
  roads: MergeRoad[];
  green: { id: string; ring: LL[]; upstream: string }[];
}
export interface TopoTreesFile {
  version: 1;
  /** flat [lng, lat, heightM, crownRadiusM, ...] */
  trees: number[];
}
export interface TopoOverrides {
  layers: Record<string, boolean>;
  excludeUpstream: string[];
  features: Record<string, boolean>;
}
export const topoOverrides = overridesJson as unknown as TopoOverrides;

const toScene = (p: LL): Vec2 => {
  const [x, z] = projectRaw(p[0], p[1]);
  return GLOBAL_OFFSET.enabled ? [x + GLOBAL_OFFSET.east, z - GLOBAL_OFFSET.north] : [x, z];
};
const ring = (r: LL[]): Vec2[] => r.map(toScene);

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/**
 * Point on a footprint's edge closest to a driveway (service road), sampled every metre: the approximate entrance on
 * the side facing the drive. Undefined when no driveway is within 40 m. Approximate by design, never surveyed.
 */
export function edgeFacing(fp: Vec2[], drives: Polyline[], maxM = 40): Vec2 | undefined {
  let best: Vec2 | undefined,
    bd = maxM;
  const near = drives.filter((r) =>
    r.points.some((q) => fp.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < maxM + 60)),
  );
  for (let i = 0; i < fp.length - 1; i++) {
    const a = fp[i],
      b = fp[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k <= n; k++) {
      const p: Vec2 = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      for (const r of near)
        for (let j = 0; j < r.points.length - 1; j++) {
          const d = segDist(p, r.points[j], r.points[j + 1]);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
    }
  }
  return best;
}

export interface TopoReport {
  additions: number;
  replacements: number;
  suppressed: number;
  hostelFootprints: number;
  flags: number;
  roads: number;
  green: number;
  trees: number;
  skipped: number;
}

export function applyTopoMerge(
  data: CampusData,
  merge: TopoMergeFile | null,
  trees: TopoTreesFile | null = null,
  o: TopoOverrides = topoOverrides,
): CampusData & { topoReport?: TopoReport } {
  if (!merge) return data;
  const rep: TopoReport = {
    additions: 0,
    replacements: 0,
    suppressed: 0,
    hostelFootprints: 0,
    flags: 0,
    roads: 0,
    green: 0,
    trees: 0,
    skipped: 0,
  };
  const layer = (n: string) => o.layers[n] !== false;
  const ok = (id: string, upstream?: string) => {
    if (o.features[id] === false) return false;
    if (upstream && o.excludeUpstream.length) {
      const ups = upstream.split(' + ');
      if (ups.every((u) => o.excludeUpstream.includes(u))) return false;
    }
    return true;
  };

  let buildings = data.buildings.slice();
  let places = data.places.slice();
  const roads = data.roads.slice();
  const footways = data.footways.slice();
  const green = data.green.slice();
  const defH = DEFAULT_HEIGHT.other;

  // ── flags (debug only; geometry untouched) ──
  for (const f of merge.flags) {
    const i = buildings.findIndex((b) => b.id === f.id);
    if (i < 0) continue;
    buildings[i] = { ...buildings[i], flags: [...(buildings[i].flags ?? []), f.reason] };
    rep.flags++;
  }

  // ── exact duplicate ways: hide the unnamed copy (z-fighting) ──
  if (layer('replacements'))
    for (const s of merge.suppressed ?? []) {
      if (!ok(`dup:${s.target}`)) continue;
      const n0 = buildings.length;
      buildings = buildings.filter((b) => b.id !== s.target);
      if (buildings.length < n0) rep.suppressed++;
    }

  // ── Rule 1: replace defective OSM outlines ──
  if (layer('replacements'))
    for (const r of merge.replacements) {
      const i = buildings.findIndex((b) => b.id === r.target);
      if (i < 0 || !ok(r.target)) {
        rep.skipped++;
        continue;
      }
      const old = buildings[i];
      const parts: BuildingShape[] = r.parts.map((p, k) => ({
        ...old,
        id: r.parts.length > 1 ? `${old.id}~t${k + 1}` : old.id,
        footprint: ring(p),
        holes: [],
        source: r.source,
        flags: [...(old.flags ?? []), `outline replaced: ${r.reason}`],
      }));
      buildings.splice(i, 1, ...parts);
      const pl = places.findIndex((p) => p.id === old.placeId);
      if (pl >= 0) places[pl] = { ...places[pl], footprints: parts.map((p) => p.footprint) };
      rep.replacements++;
    }

  // ── Rule 3: hostels (real outlines replace the provisional block) ──
  if (layer('hostels')) {
    const groups = new Map<string, MergeHostel[]>();
    for (const h of merge.hostels) {
      if (!ok(h.id, h.upstream)) {
        rep.skipped++;
        continue;
      }
      groups.set(h.placeId, [...(groups.get(h.placeId) ?? []), h]);
    }
    for (const [placeId, hs] of groups) {
      const rings = hs.map((h) => ring(h.ring));
      const existing = places.findIndex((p) => p.id === placeId);
      const name = hs[0].placeName;
      // heights.ts entry for the OSM hostel area these outlines sit in (the outlines carry no OSM id themselves)
      const areaNum = Number(/\d+$/.exec(hs[0].areaId)?.[0]);
      const he = HEIGHTS.find((h) => h.osmId === areaNum);
      const height = he?.floors
        ? he.floors * (he.floorHeightM ?? DEFAULT_FLOOR_HEIGHT_M)
        : DEFAULT_HEIGHT.hostel;
      const heightSource = he?.floors
        ? `heights.ts: ${he.floors} floors x ${he.floorHeightM ?? DEFAULT_FLOOR_HEIGHT_M} m (${he.source}, unverified)`
        : 'category default (provisional)';
      const roofType = he?.roofType ?? 'flat';
      const drive = roads.filter((r) => r.kind === 'service' && !r.provisional);
      // any leftover provisional block for this place goes away once real outlines exist
      buildings = buildings.filter((b) => !(b.placeId === placeId && b.provisional && !b.source));
      const shapes: BuildingShape[] = hs.map((h, k) => {
        const flags = [
          `outline from ${h.source}: ${h.upstream} (${h.confidence} confidence)`,
          ...(h.incomplete
            ? ['other buildings in this area are not drawn (their outlines are excluded)']
            : []),
          ...(roofType === 'hostel-template'
            ? [
                'curved central block: height unverified',
                'drum, vents and entrance canopy: approximate decoration',
                'entrance: approximate, unverified (edge facing the loop driveway)',
              ]
            : []),
        ];
        return {
          id: `topo:${h.id}`,
          osmId: 0,
          name,
          footprint: rings[k],
          holes: [],
          height,
          heightSource,
          roofType,
          placeId,
          provisional: true,
          source: `${h.source}: ${h.upstream}`,
          flags,
          entrance: roofType === 'hostel-template' ? edgeFacing(rings[k], drive) : undefined,
        };
      });
      buildings.push(...shapes);
      const biggest = rings.reduce((a, r) => (r.length >= a.length ? r : a), rings[0]);
      const bigShape = shapes[rings.indexOf(biggest)];
      if (existing >= 0)
        places[existing] = {
          ...places[existing],
          footprints: rings,
          pos: polylabel([biggest], 0.5),
          flat: false,
          needsOutline: false,
          provisional: true,
          source: places[existing].source === 'extra' ? 'topo' : places[existing].source,
          resolvedHeight: height,
          heightSource,
          heightEstimated: !he?.floors,
          ...(he?.floors ? { levels: he.floors, levelsEstimated: true } : {}),
          ...(bigShape.entrance ? { entrance: bigShape.entrance, entranceApprox: true } : {}),
        };
      else
        places.push({
          id: placeId,
          source: 'topo',
          name,
          shortName: name,
          category: 'hostel',
          aliases: [name, ...nameVariants(name)],
          description: 'Info coming soon',
          verified: false,
          offCampus: false,
          pos: polylabel([biggest], 0.5),
          footprints: rings,
          resolvedHeight: DEFAULT_HEIGHT.hostel,
          heightSource: 'category default (provisional)',
          heightEstimated: true,
          flat: false,
          provisional: true,
        } satisfies Place);
      rep.hostelFootprints += hs.length;
    }
  }

  // ── Rule 2: provisional additions (no OSM counterpart) ──
  if (layer('additions'))
    for (const a of merge.additions) {
      if (!ok(a.id, a.upstream)) {
        rep.skipped++;
        continue;
      }
      buildings.push({
        id: `topo:${a.id}`,
        osmId: 0,
        footprint: ring(a.ring),
        holes: [],
        height: defH,
        heightSource: 'category default (provisional)',
        roofType: 'flat',
        provisional: true,
        source: `${a.source}: ${a.upstream} (${a.confidence} confidence)`,
      });
      rep.additions++;
    }

  // ── roads and paths (provisional, never replacing existing ones) ──
  if (layer('roads'))
    for (const r of merge.roads) {
      if (!ok(r.id, r.upstream)) {
        rep.skipped++;
        continue;
      }
      const kind =
        r.cls === 'living_street' || r.cls === 'unclassified' || ROAD_KINDS.has(r.cls)
          ? r.cls
          : FOOT_KINDS.has(r.cls)
            ? r.cls
            : 'service';
      const line: Polyline = {
        id: `topo:${r.id}`,
        kind,
        points: r.pts.map(toScene),
        name: r.name,
        provisional: true,
        source: `overture: ${r.upstream}`,
      };
      (FOOT_KINDS.has(kind) ? footways : roads).push(line);
      rep.roads++;
    }

  // ── green space gaps ──
  if (layer('green'))
    for (const g of merge.green) {
      if (!ok(g.id, g.upstream)) {
        rep.skipped++;
        continue;
      }
      const a: Area = {
        id: `topo:${g.id}`,
        kind: 'grass',
        points: ring(g.ring),
        holes: [],
        provisional: true,
        source: `overture: ${g.upstream}`,
      };
      green.push(a);
      rep.green++;
    }

  // ── individual trees ──
  const treePts: PointFeature[] = data.trees.slice();
  let treeRegion: Vec2[][] | undefined;
  if (layer('trees') && trees && trees.trees.length) {
    const t = trees.trees;
    for (let i = 0; i + 3 < t.length; i += 4)
      treePts.push({
        id: `topo-tree-${i / 4}`,
        kind: 'topo',
        pos: toScene([t[i], t[i + 1]]),
        h: t[i + 2],
        r: t[i + 3],
      });
    treeRegion = merge.region.map(ring);
    rep.trees = t.length / 4;
  }

  return {
    ...data,
    buildings,
    places,
    roads,
    footways,
    green,
    trees: treePts,
    treeRegion,
    topoReport: rep,
  };
}
