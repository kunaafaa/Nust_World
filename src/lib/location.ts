import { CAMPUS_BBOX, dist, distToSegment } from './geo';
import type { Vec2 } from './types';

/** Fixes implying more than this speed are GPS glitches, not walking or driving. */
export const MAX_SPEED_MS = 30;
export const SNAP_MAX_ACCURACY = 25; // only snap when the fix itself is decent
export const SNAP_MAX_DIST = 15; // and the path is this close
export const WEAK_GPS_M = 50;
export const ARRIVE_M = 15;
export const REROUTE_M = 25;
/** How far outside the campus bbox still counts as "near campus" (metres worth of degrees ≈ 0.003°). */
const NEAR_PAD = 0.003;

export const nearCampus = (lon: number, lat: number) =>
  lon >= CAMPUS_BBOX[0] - NEAR_PAD &&
  lat >= CAMPUS_BBOX[1] - NEAR_PAD &&
  lon <= CAMPUS_BBOX[2] + NEAR_PAD &&
  lat <= CAMPUS_BBOX[3] + NEAR_PAD;

export interface Fix {
  pos: Vec2;
  accuracy: number;
  t: number;
}

/** True if the new fix is physically plausible given the previous accepted fix. */
export function plausible(prev: Fix | null, next: Fix): boolean {
  if (!prev) return true;
  const dt = Math.max(0.2, (next.t - prev.t) / 1000);
  return dist(prev.pos, next.pos) / dt <= MAX_SPEED_MS;
}

/** Exponential smoothing; trusts better fixes more. Returns the new displayed position. */
export function smooth(prev: Vec2 | null, next: Fix, prevAcc: number): Vec2 {
  if (!prev) return next.pos;
  const jump = dist(prev, next.pos);
  // A fix that is much better than before, or a big real move, should converge quickly.
  const alpha =
    next.accuracy < prevAcc * 0.6 || jump > 40 ? 0.7 : jump < next.accuracy * 0.25 ? 0.2 : 0.4;
  return [prev[0] + (next.pos[0] - prev[0]) * alpha, prev[1] + (next.pos[1] - prev[1]) * alpha];
}

export interface SnapIndex {
  snap(p: Vec2, maxDist: number): { pos: Vec2; dist: number } | null;
}

/** Spatial hash over path segments for snapping a position to the nearest footpath. */
export function buildSnapIndex(lines: Vec2[][]): SnapIndex {
  const CELL = 30;
  const grid = new Map<string, [Vec2, Vec2][]>();
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL),
        x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const z0 = Math.floor(Math.min(a[1], b[1]) / CELL),
        z1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const k = `${x},${z}`;
          const arr = grid.get(k);
          if (arr) arr.push([a, b]);
          else grid.set(k, [[a, b]]);
        }
    }
  }
  return {
    snap(p, maxDist) {
      const cx = Math.floor(p[0] / CELL),
        cz = Math.floor(p[1] / CELL);
      const r = Math.ceil(maxDist / CELL);
      let best: { pos: Vec2; dist: number } | null = null;
      for (let x = cx - r; x <= cx + r; x++)
        for (let z = cz - r; z <= cz + r; z++) {
          for (const [a, b] of grid.get(`${x},${z}`) ?? []) {
            const d = distToSegment(p, a, b);
            if (d > maxDist || (best && d >= best.dist)) continue;
            const dx = b[0] - a[0],
              dz = b[1] - a[1];
            const t = Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
            );
            best = { pos: [a[0] + t * dx, a[1] + t * dz], dist: d };
          }
        }
      return best;
    },
  };
}

/** Display position: snapped to a footpath only when the fix is accurate and the path is very close. */
export function maybeSnap(idx: SnapIndex | null, p: Vec2, accuracy: number): Vec2 {
  if (!idx || accuracy >= SNAP_MAX_ACCURACY) return p;
  return idx.snap(p, SNAP_MAX_DIST)?.pos ?? p;
}

/** Distance in metres from p to the nearest point on a polyline. */
export function distToPath(p: Vec2, path: Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++)
    best = Math.min(best, distToSegment(p, path[i - 1], path[i]));
  return best;
}
