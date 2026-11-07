import { GROUND_BUFFER, boundaryDist } from './boundary';
import { distToSegment, orientedBox, pointInRing, polygonArea, SCENE_BOUNDS } from './geo';
import { layoutBays, type Bay } from './parking';
import type { CampusData, Vec2 } from './types';

/** Seeded PRNG: identical output on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CELL = 40;
const ROAD_HALF: Record<string, number> = {
  trunk: 6.5,
  trunk_link: 3.5,
  primary: 6,
  secondary: 4,
  secondary_link: 3,
  tertiary: 3.5,
  residential: 3,
  unclassified: 3,
  living_street: 2.5,
  service: 2,
  busway: 3.5,
};
const FOOT_HALF: Record<string, number> = {
  footway: 0.9,
  path: 0.75,
  steps: 0.9,
  pedestrian: 1.5,
  track: 1.25,
  cycleway: 0.8,
};

type Prim =
  | { t: 'poly'; ring: Vec2[]; kind: string }
  | { t: 'seg'; a: Vec2; b: Vec2; half: number; kind: string };

export interface Obstacles {
  /** True if p is within `margin` metres of a building, road, path, water, pitch or (optionally) parking lot. */
  blocked(p: Vec2, margin?: number, opts?: { parking?: boolean; plaza?: boolean }): boolean;
  /** Which obstacle class blocks p (for tests/debug), or null. */
  why(p: Vec2, margin?: number): string | null;
}

export function buildObstacles(data: CampusData): Obstacles {
  const grid = new Map<string, Prim[]>();
  const add = (prim: Prim, minX: number, minZ: number, maxX: number, maxZ: number, pad: number) => {
    for (let x = Math.floor((minX - pad) / CELL); x <= Math.floor((maxX + pad) / CELL); x++)
      for (let z = Math.floor((minZ - pad) / CELL); z <= Math.floor((maxZ + pad) / CELL); z++) {
        const k = `${x},${z}`;
        const a = grid.get(k);
        if (a) a.push(prim);
        else grid.set(k, [prim]);
      }
  };
  const addPoly = (ring: Vec2[], kind: string) => {
    let a = Infinity,
      b = Infinity,
      c = -Infinity,
      d = -Infinity;
    for (const [x, z] of ring) {
      a = Math.min(a, x);
      b = Math.min(b, z);
      c = Math.max(c, x);
      d = Math.max(d, z);
    }
    add({ t: 'poly', ring, kind }, a, b, c, d, 6);
  };
  for (const b of data.buildings) if (!b.offCampus) addPoly(b.footprint, 'building');
  for (const w of data.water) addPoly(w.points, 'water');
  for (const p of data.pitches) addPoly(p.points, 'pitch');
  for (const p of data.parking) addPoly(p.points, 'parking');
  for (const p of data.plazas) addPoly(p.points, 'plaza');
  const addLine = (pts: Vec2[], half: number, kind: string) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      add(
        { t: 'seg', a, b, half, kind },
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
        half + 6,
      );
    }
  };
  for (const r of data.roads) addLine(r.points, ROAD_HALF[r.kind] ?? 3, 'road');
  for (const f of data.footways) addLine(f.points, FOOT_HALF[f.kind] ?? 0.9, 'path');

  const why = (
    p: Vec2,
    margin = 0,
    opts: { parking?: boolean; plaza?: boolean } = {},
  ): string | null => {
    for (const prim of grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? []) {
      if (prim.t === 'seg') {
        if (distToSegment(p, prim.a, prim.b) < prim.half + margin) return prim.kind;
      } else {
        if (prim.kind === 'parking' && !opts.parking) continue;
        if (prim.kind === 'plaza' && !opts.plaza) continue;
        if (pointInRing(p, prim.ring)) return prim.kind;
        if (margin > 0) {
          for (let i = 0, j = prim.ring.length - 1; i < prim.ring.length; j = i++)
            if (distToSegment(p, prim.ring[j], prim.ring[i]) < margin) return prim.kind;
        }
      }
    }
    return null;
  };
  return {
    blocked: (p, m = 0, o) => why(p, m, o) !== null,
    why: (p, m = 0) => why(p, m, { parking: true }),
  };
}

/** Bridson Poisson-disc sampling inside a polygon, with per-sample spacing in [rMin, rMax]. */
export function poissonFill(
  rings: Vec2[][],
  rand: () => number,
  rMin: number,
  rMax: number,
  accept: (p: Vec2) => boolean,
  cap: number,
): Vec2[] {
  const outer = rings[0];
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const [x, z] of outer) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  const [bx0, bz0, bx1, bz1] = SCENE_BOUNDS;
  minX = Math.max(minX, bx0 - 80);
  maxX = Math.min(maxX, bx1 + 80);
  minZ = Math.max(minZ, bz0 - 80);
  maxZ = Math.min(maxZ, bz1 + 80);
  if (maxX <= minX || maxZ <= minZ) return [];
  const cell = rMin / Math.SQRT2;
  const gw = Math.ceil((maxX - minX) / cell) + 1,
    gh = Math.ceil((maxZ - minZ) / cell) + 1;
  if (gw * gh > 4_000_000) return [];
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: Vec2[] = [],
    radii: number[] = [],
    active: number[] = [];
  const inside = (p: Vec2) =>
    pointInRing(p, outer) && !rings.slice(1).some((h) => pointInRing(p, h));
  const far = (p: Vec2, r: number) => {
    const cx = Math.floor((p[0] - minX) / cell),
      cz = Math.floor((p[1] - minZ) / cell);
    const span = Math.ceil(rMax / cell);
    for (let x = Math.max(0, cx - span); x <= Math.min(gw - 1, cx + span); x++)
      for (let z = Math.max(0, cz - span); z <= Math.min(gh - 1, cz + span); z++) {
        const i = grid[z * gw + x];
        if (i < 0) continue;
        if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) < (radii[i] + r) / 2) return false;
      }
    return true;
  };
  const put = (p: Vec2, r: number) => {
    pts.push(p);
    radii.push(r);
    active.push(pts.length - 1);
    grid[Math.floor((p[1] - minZ) / cell) * gw + Math.floor((p[0] - minX) / cell)] = pts.length - 1;
  };
  // Seed several starts so disconnected / thin polygons are still covered.
  for (let tries = 0; tries < 60 && pts.length < 3; tries++) {
    const p: Vec2 = [minX + rand() * (maxX - minX), minZ + rand() * (maxZ - minZ)];
    if (inside(p) && accept(p)) put(p, rMin + rand() * (rMax - rMin));
  }
  while (active.length && pts.length < cap) {
    const ai = Math.floor(rand() * active.length);
    const base = pts[active[ai]];
    let found = false;
    for (let k = 0; k < 18; k++) {
      const r = rMin + rand() * (rMax - rMin);
      const ang = rand() * Math.PI * 2,
        d = r * (1 + rand());
      const p: Vec2 = [base[0] + Math.cos(ang) * d, base[1] + Math.sin(ang) * d];
      if (p[0] < minX || p[0] > maxX || p[1] < minZ || p[1] > maxZ) continue;
      if (!inside(p) || !accept(p) || !far(p, r)) continue;
      put(p, r);
      found = true;
      break;
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

export type TreeType = 'round' | 'conifer' | 'palm' | 'shrub';
export interface TreeSpot {
  x: number;
  z: number;
  type: TreeType;
  s: number;
  rot: number;
  tint: number;
}
export interface CarSpot {
  x: number;
  z: number;
  angle: number;
  model: number;
  color: number;
}

const FOREST = /^(forest|wood|scrub|orchard)$/;
const PARK = /^(park|garden|conservation|recreation_ground)$/;

/** All tree placements for the campus. Deterministic. `cap` is applied after a seeded shuffle so any prefix is evenly spread. */
export function scatterTrees(data: CampusData, obs: Obstacles, seed = 20251107): TreeSpot[] {
  const rand = rng(seed);
  const out: TreeSpot[] = [];
  const free = (p: Vec2, m = 1.2) => !obs.blocked(p, m, { parking: false });
  const mk = (p: Vec2, type: TreeType): TreeSpot => ({
    x: p[0],
    z: p[1],
    type,
    s: 0.8 + rand() * 0.55,
    rot: rand() * Math.PI * 2,
    tint: rand(),
  });

  // Individual trees (topo canopy data) replace the random scatter inside the topo region; OSM-surveyed trees come first.
  const region = data.treeRegion;
  const inRegion = (p: Vec2) => !!region && region.some((r) => pointInRing(p, r));
  const bld = data.buildings.map((b) => ({ ring: b.footprint, bb: ringBox(b.footprint) }));
  const onBuilding = (p: Vec2) =>
    bld.some(
      (b) =>
        p[0] >= b.bb[0] &&
        p[0] <= b.bb[2] &&
        p[1] >= b.bb[1] &&
        p[1] <= b.bb[3] &&
        pointInRing(p, b.ring),
    );
  for (const t of data.trees) {
    if (t.h === undefined || t.r === undefined) {
      out.push(mk(t.pos, 'round'));
      continue;
    }
    if (onBuilding(t.pos)) continue; // canopy model puts trees over roofs
    // Size from the data (canopy height h, crown radius r); the model has no species, so the type follows the form only.
    const type: TreeType = t.h < 4.5 ? 'shrub' : t.h / t.r >= 3.2 ? 'conifer' : 'round';
    const nomR = type === 'conifer' ? 1.7 : 2.1;
    const nomH = type === 'conifer' ? 7.2 : type === 'shrub' ? 1.6 : 7.1;
    const s = Math.min(3, Math.max(0.7, (t.r / nomR + t.h / nomH) / 2));
    out.push({ x: t.pos[0], z: t.pos[1], type, s, rot: rand() * Math.PI * 2, tint: rand() });
  }

  for (const g of data.green) {
    const forest = FOREST.test(g.kind),
      park = PARK.test(g.kind);
    if (!forest && !park) continue;
    if (/convocation/i.test(g.name ?? '')) continue;
    const area = Math.abs(polygonArea(g.points));
    if (area < 80) continue;
    const pts = poissonFill(
      [g.points, ...g.holes],
      rand,
      4,
      6,
      (p) => free(p, 1.5) && !inRegion(p), // real trees exist inside the topo region
      forest ? 2500 : 900,
    );
    for (const p of pts) {
      const r = rand();
      const type: TreeType = forest
        ? r < 0.5
          ? 'round'
          : r < 0.85
            ? 'conifer'
            : 'shrub'
        : r < 0.55
          ? 'round'
          : r < 0.75
            ? 'palm'
            : r < 0.9
              ? 'shrub'
              : 'conifer';
      out.push(mk(p, type));
    }
  }

  // Avenues: palms and conifers along the main roads, both sides.
  for (const r of data.roads) {
    if (!/^(trunk|secondary|tertiary|residential)$/.test(r.kind)) continue;
    const half = ROAD_HALF[r.kind] ?? 3;
    let acc = rand() * 18;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) continue;
      const nx = -(b[1] - a[1]) / len,
        nz = (b[0] - a[0]) / len;
      for (let t = 0; t < len; t += 1) {
        if (++acc < 18 + rand() * 6) continue;
        acc = 0;
        for (const side of [1, -1]) {
          const off = half + 2.4;
          const p: Vec2 = [
            a[0] + ((b[0] - a[0]) * t) / len + nx * off * side,
            a[1] + ((b[1] - a[1]) * t) / len + nz * off * side,
          ];
          if (free(p, 1.2) && !inRegion(p)) out.push(mk(p, rand() < 0.6 ? 'palm' : 'conifer'));
        }
      }
    }
  }

  // Landmark frontages: a few palms at the corners of the bigger academic / admin buildings.
  for (const pl of data.places) {
    if (pl.offCampus || !pl.footprints.length || !/academic|admin|prayer/.test(pl.category))
      continue;
    const b = orientedBox(pl.footprints[0]);
    if (b.length * b.width < 400) continue;
    const ca = Math.cos(b.angle),
      sa = Math.sin(b.angle);
    for (const [su, sv] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const u = su * (b.length / 2 + 4.5),
        v = sv * (b.width / 2 + 4.5);
      const p: Vec2 = [b.cx + u * ca - v * sa, b.cz + u * sa + v * ca];
      if (free(p, 1.5) && !inRegion(p)) out.push(mk(p, 'palm'));
    }
  }

  // Seeded shuffle so a quality cap keeps an even spread.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // nothing is planted beyond the campus boundary buffer: the edge dissolves instead of ending in trees
  const ring = data.boundary;
  return ring ? out.filter((t) => boundaryDist([t.x, t.z], ring) > -GROUND_BUFFER + 10) : out;
}

export const TREE_CAP = { high: 6000, medium: 3000, low: 1200 } as const;

/** Parked cars on bay rows (50–80 % filled) plus a few roadside cars near hostels and messes. */
export function scatterParkedCars(
  data: CampusData,
  obs: Obstacles,
  seed = 77,
): { cars: CarSpot[]; lines: Vec2[][]; bays: Bay[] } {
  const rand = rng(seed);
  const cars: CarSpot[] = [];
  const lines: Vec2[][] = [];
  const allBays: Bay[] = [];
  // Weighted toward white and silver (indices into the palette in scene/cars.ts).
  const pickColor = () => {
    const r = rand();
    return r < 0.34
      ? 0
      : r < 0.6
        ? 1
        : r < 0.72
          ? 2
          : r < 0.82
            ? 3
            : r < 0.9
              ? 4
              : r < 0.95
                ? 5
                : 6;
  };
  const pickModel = () => {
    const r = rand();
    return r < 0.36 ? 0 : r < 0.6 ? 1 : r < 0.76 ? 2 : r < 0.86 ? 3 : r < 0.93 ? 4 : 5;
  };
  for (const p of data.parking) {
    const { bays, lines: l } = layoutBays([p.points, ...p.holes], (q) =>
      obs.blocked(q, 0.4, { parking: false }),
    );
    lines.push(...l);
    allBays.push(...bays);
    const fill = 0.5 + rand() * 0.3;
    for (const b of bays)
      if (rand() < fill)
        cars.push({ x: b.x, z: b.z, angle: b.angle, model: pickModel(), color: pickColor() });
  }
  // Roadside cars: along service roads next to hostels and messes.
  const hot = data.places.filter(
    (p) => !p.offCampus && (p.category === 'hostel' || p.category === 'food'),
  );
  for (const pl of hot) {
    for (const r of data.roads) {
      if (r.kind !== 'service' && r.kind !== 'residential') continue;
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1],
          b = r.points[i];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 8) continue;
        const mx = (a[0] + b[0]) / 2,
          mz = (a[1] + b[1]) / 2;
        if (Math.hypot(mx - pl.pos[0], mz - pl.pos[1]) > 45 || rand() > 0.35) continue;
        const nx = -(b[1] - a[1]) / len,
          nz = (b[0] - a[0]) / len;
        const half = ROAD_HALF[r.kind] ?? 3;
        const side = rand() > 0.5 ? 1 : -1;
        // Parked on the verge just off the carriageway: never on the road, a building, water or a pitch.
        const p: Vec2 = [mx + nx * (half + 1.3) * side, mz + nz * (half + 1.3) * side];
        if (!obs.blocked(p, 1.0))
          cars.push({
            x: p[0],
            z: p[1],
            angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
            model: pickModel(),
            color: pickColor(),
          });
      }
    }
  }
  return { cars, lines, bays: allBays };
}

const ringBox = (r: Vec2[]): [number, number, number, number] => {
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
