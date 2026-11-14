/**
 * Template-based hostels: draws Rehmat Hostel and Razi 1 with exact copies of the Ghazali 1 / Ghazali 2 OSM footprints,
 * placed by data/hostel-placement.ts (the single editable source). Applied by the data loader after the topo merge.
 *
 * The copy is rigid: mirror (optional), rotate, move. No scaling, no simplification, holes kept, the template
 * buildings untouched. Everything produced here is flagged "template-based, approximate".
 */
import {
  HOSTEL_PLACEMENT,
  HOSTEL_TEMPLATES,
  PLACEMENT_AREA,
  type HostelPlacement,
  type PlacedHostel,
} from '../../data/hostel-placement';
import { DEFAULT_FLOOR_HEIGHT_M, HEIGHTS } from '@/data/heights';
import { nameVariants } from './aliases';
import { distToSegment, pointInPolygon, polylabel, project } from './geo';
import { edgeFacing } from './topoMerge';
import type { BuildingShape, CampusData, Place, PlacementInfo, Vec2 } from './types';

/** Names and search aliases of the placed hostels. */
export const PLACED_HOSTELS: Record<
  PlacedHostel,
  { placeId: string; name: string; aliases: string[] }
> = {
  rehmat: {
    placeId: 'rehmat-hostel',
    name: 'Rehmat Hostel',
    aliases: ['Rehmat Hostel', 'Rahmat Hostel', 'rehmat', 'rahmat', 'razi hostels'],
  },
  'razi-1': {
    placeId: 'razi-1',
    name: 'Razi 1',
    aliases: ['Razi 1', 'Razi I', 'razi', 'razi 1', 'razi hostel', 'razi hostels'],
  },
};

export const TEMPLATE_FLAG = 'template-based, approximate';

/** Area-weighted centroid of a ring (falls back to the vertex average for a degenerate ring). */
export function areaCentroid(r: Vec2[]): Vec2 {
  let a = 0,
    x = 0,
    z = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i],
      q = r[(i + 1) % r.length];
    const c = p[0] * q[1] - q[0] * p[1];
    a += c;
    x += (p[0] + q[0]) * c;
    z += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-9) {
    const n = r.length || 1;
    return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n];
  }
  return [x / (3 * a), z / (3 * a)];
}

/**
 * Rigid placement of one point: relative to the template pivot, mirrored east-west if asked, rotated clockwise
 * (seen from above, north up: scene x = east, z = south), then moved to `to`.
 */
export function placePoint(p: Vec2, pivot: Vec2, to: Vec2, deg: number, mirror: boolean): Vec2 {
  const t = (deg * Math.PI) / 180,
    c = Math.cos(t),
    s = Math.sin(t);
  let dx = p[0] - pivot[0];
  const dz = p[1] - pivot[1];
  if (mirror) dx = -dx;
  return [to[0] + dx * c - dz * s, to[1] + dx * s + dz * c];
}

/** Places a ring; a mirrored ring is reversed so its winding stays the same as the template's. */
export function placeRing(r: Vec2[], pivot: Vec2, to: Vec2, deg: number, mirror: boolean): Vec2[] {
  const out = r.map((p) => placePoint(p, pivot, to, deg, mirror));
  return mirror ? out.reverse() : out;
}

/** Scene position of a placement: `centre` (lat, lng) projected, plus `offsetM` (x east, z south). */
export function placementTarget(v: HostelPlacement): Vec2 {
  const [x, z] = project(v.centre[1], v.centre[0]);
  return [x + v.offsetM[0], z + v.offsetM[1]];
}

/** Distance from p to a ring's edges. */
export function distToRing(p: Vec2, r: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < r.length; i++) d = Math.min(d, distToSegment(p, r[i], r[(i + 1) % r.length]));
  return d;
}

/** Points along a ring's edges, every `step` metres. */
export function sampleRing(r: Vec2[], step = 1): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i],
      b = r[(i + 1) % r.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** How far a footprint pokes out of the area polygon: worst distance outside (0 = fits) and where. */
export function outsideBy(fp: Vec2[], area: Vec2[]): { m: number; at?: Vec2 } {
  let m = 0,
    at: Vec2 | undefined;
  for (const p of sampleRing(fp, 0.5))
    if (!pointInPolygon(p, [area])) {
      const d = distToRing(p, area);
      if (d > m) {
        m = d;
        at = p;
      }
    }
  return { m, at };
}

/** A label point near the area's edge (3 to 8 m in), as far as possible from the given footprints. */
export function edgeLabelPoint(area: Vec2[], avoid: Vec2[][]): Vec2 {
  let best: Vec2 = polylabel([area], 0.5),
    bd = -Infinity;
  const xs = area.map((p) => p[0]),
    zs = area.map((p) => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2)
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2) {
      const p: Vec2 = [x, z];
      if (!pointInPolygon(p, [area])) continue;
      const e = distToRing(p, area);
      if (e < 3 || e > 8) continue;
      const d = Math.min(
        ...avoid.map((r) => (pointInPolygon(p, [r]) ? -distToRing(p, r) : distToRing(p, r))),
      );
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
  return best;
}

export function applyHostelPlacement(
  data: CampusData,
  placement: Record<PlacedHostel, HostelPlacement> = HOSTEL_PLACEMENT,
): CampusData {
  const areaShape = [...data.bare].find((a) => a.id === PLACEMENT_AREA.id)?.points;
  const areaIdx = data.places.findIndex((p) => p.osmId === PLACEMENT_AREA.osmId);
  if (!areaShape || areaIdx < 0) return data;
  const areaPlace = data.places[areaIdx];
  const he = HEIGHTS.find((h) => h.osmId === PLACEMENT_AREA.osmId);
  const floors = he?.floors ?? 4;
  const floorH = he?.floorHeightM ?? DEFAULT_FLOOR_HEIGHT_M;
  const height = floors * floorH;
  const drives = data.roads.filter((r) => r.kind === 'service' && !r.provisional);

  // Any outline still attached to the area (e.g. a topo-merge footprint) gives way to the placed copies.
  const buildings = data.buildings.filter((b) => b.placeId !== areaPlace.id);
  const places = data.places.slice();
  const placed: Vec2[][] = [];

  for (const key of Object.keys(placement) as PlacedHostel[]) {
    const v = placement[key];
    const tpl = HOSTEL_TEMPLATES[v.templateFrom];
    const src = data.buildings.find((b) => b.osmId === tpl.osmId && b.footprint.length >= 3);
    if (!src) continue; // template missing from the data: draw nothing rather than invent a shape
    const meta = PLACED_HOSTELS[key];
    const pivot = areaCentroid(src.footprint);
    const to = placementTarget(v);
    const move = (r: Vec2[]) => placeRing(r, pivot, to, v.rotationDeg, v.mirror);
    const footprint = move(src.footprint);
    const holes = src.holes.map(move);
    // The template's own entrance side (edge facing its access road at Ghazali), carried with the shape.
    const tplEntrance = edgeFacing(src.footprint, drives);
    const entrance = tplEntrance
      ? placePoint(tplEntrance, pivot, to, v.rotationDeg, v.mirror)
      : edgeFacing(footprint, drives);
    const dir: Vec2 = entrance ? [entrance[0] - to[0], entrance[1] - to[1]] : [0, -1];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const out = outsideBy(footprint, areaShape);
    const info: PlacementInfo = {
      key,
      values: v,
      templateName: tpl.name,
      templateOsmId: tpl.osmId,
      entranceDir: [dir[0] / len, dir[1] / len],
      outsideM: Math.round(out.m * 10) / 10,
      ...(out.at ? { outsideAt: out.at } : {}),
    };
    const heightSource = `template: ${tpl.name} footprint, ${floors} floors x ${floorH} m (${he?.source ?? 'estimate'}, unverified)`;
    const source = `template: ${tpl.name} (OSM way/${tpl.osmId}), data/hostel-placement.ts`;
    const flags = [
      `${TEMPLATE_FLAG}: ${tpl.name} footprint copied as a stand-in, no outline in OSM`,
      `placement: rotation ${v.rotationDeg} deg, mirror ${v.mirror}, offset ${v.offsetM.join(', ')} m`,
      'entrance: approximate, unverified (the template entrance side)',
      ...(out.m > 0 ? [`outside the area polygon by ${info.outsideM} m`] : []),
    ];
    buildings.push({
      id: `template:${key}`,
      osmId: 0,
      name: meta.name,
      footprint,
      holes,
      height,
      heightSource,
      roofType: he?.roofType ?? 'hostel-template',
      placeId: meta.placeId,
      source,
      flags,
      entrance,
    } satisfies BuildingShape);
    const aliases = new Set<string>();
    for (const a of meta.aliases) [a, ...nameVariants(a)].forEach((x) => aliases.add(x));
    places.push({
      id: meta.placeId,
      source: 'template',
      name: meta.name,
      shortName: meta.name,
      category: 'hostel',
      aliases: [...aliases],
      description: 'Info coming soon',
      verified: false,
      offCampus: false,
      levels: floors,
      levelsEstimated: true,
      ...(entrance ? { entrance, entranceApprox: true } : {}),
      pos: polylabel([footprint], 0.5),
      footprints: [footprint],
      resolvedHeight: height,
      heightSource,
      heightEstimated: true,
      flat: false,
      photoSlot: true,
      placement: info,
    } satisfies Place);
    placed.push(footprint);
  }
  if (!placed.length) return data;

  // The area keeps its dashed boundary and its place, but its label moves to the edge, small and muted.
  places[areaIdx] = {
    ...areaPlace,
    footprints: [],
    flat: true,
    resolvedHeight: 0,
    areaLabel: true,
    pos: edgeLabelPoint(areaShape, placed),
  };
  return { ...data, buildings, places };
}
