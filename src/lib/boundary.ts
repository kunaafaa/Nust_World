/**
 * Campus boundary + polygon hygiene helpers. Pure functions (no DOM), shared by the app and scripts.
 * Scene metres (lib/geo.ts); the boundary ring is open (no repeated first point).
 */
import { distToSegment, polygonArea, signedDistToPolygon } from './geo';
import type { Vec2 } from './types';

export interface BoundaryFile {
  /** [lng, lat] ring, closed GeoJSON polygon */
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }[];
}

/** Distance in metres the ground layers are allowed to extend past the boundary (feathered out over it). */
export const GROUND_BUFFER = 30;
/** Roads fade to zero over this length ending at the buffer edge. */
export const ROAD_FADE = 60;
/** Context-ring roads reach this far past the boundary. */
export const CONTEXT_RANGE = 400;

const same = (a: Vec2, b: Vec2, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

/** Drop the repeated closing point, snap consecutive vertices closer than `tol`, drop collinear spikes of zero width. */
export function cleanRing(ring: Vec2[], tol = 0.3): Vec2[] {
  let r = ring.slice();
  if (r.length > 1 && same(r[0], r[r.length - 1], 0)) r = r.slice(0, -1);
  const out: Vec2[] = [];
  for (const p of r) if (!out.length || !same(out[out.length - 1], p, tol)) out.push(p);
  while (out.length > 1 && same(out[0], out[out.length - 1], tol)) out.pop();
  return out;
}

function segHit(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = [b[0] - a[0], b[1] - a[1]],
    s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

/** Number of self-crossings of a ring (adjacent edges ignored). */
export function selfIntersections(ring: Vec2[]): number {
  const n = ring.length;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segHit(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) k++;
    }
  return k;
}

/**
 * Remove self-intersections: split the ring at the first crossing into two loops and keep the larger one
 * (the smaller is a bow-tie fragment). Repeats until simple. Returns the ring and how many crossings were cut.
 */
export function makeSimple(ring: Vec2[]): { ring: Vec2[]; cuts: number } {
  let cur = ring.slice();
  let cuts = 0;
  for (let guard = 0; guard < 50; guard++) {
    const n = cur.length;
    let found: { i: number; j: number; p: Vec2 } | null = null;
    outer: for (let i = 0; i < n; i++)
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const p = segHit(cur[i], cur[(i + 1) % n], cur[j], cur[(j + 1) % n]);
        if (p) {
          found = { i, j, p };
          break outer;
        }
      }
    if (!found) break;
    const { i, j, p } = found;
    const loopA: Vec2[] = [p, ...cur.slice(i + 1, j + 1)];
    const loopB: Vec2[] = [p, ...cur.slice(j + 1), ...cur.slice(0, i + 1)];
    cur = Math.abs(polygonArea(loopA)) >= Math.abs(polygonArea(loopB)) ? loopA : loopB;
    cuts++;
  }
  return { ring: cur, cuts };
}

/** Douglas-Peucker on a closed ring, anchored at the two most distant vertices so corners survive. */
export function simplifyRing(ring: Vec2[], tol: number): Vec2[] {
  const n = ring.length;
  if (n < 5) return ring;
  let ai = 0,
    bi = 0,
    best = -1;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 60)))
    for (let j = i + Math.max(1, Math.floor(n / 60)); j < n; j += Math.max(1, Math.floor(n / 60))) {
      const d = Math.hypot(ring[i][0] - ring[j][0], ring[i][1] - ring[j][1]);
      if (d > best) {
        best = d;
        ai = i;
        bi = j;
      }
    }
  const dp = (pts: Vec2[]): Vec2[] => {
    if (pts.length < 3) return pts;
    let idx = -1,
      dm = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
      if (d > dm) {
        dm = d;
        idx = i;
      }
    }
    if (dm <= tol) return [pts[0], pts[pts.length - 1]];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  const lo = Math.min(ai, bi),
    hi = Math.max(ai, bi);
  const a = ring.slice(lo, hi + 1);
  const b = [...ring.slice(hi), ...ring.slice(0, lo + 1)];
  return [...dp(a).slice(0, -1), ...dp(b).slice(0, -1)];
}

/** Counter-clockwise in scene space (polygonArea > 0) so every ring has the same winding. */
export const orient = (ring: Vec2[]): Vec2[] =>
  polygonArea(ring) < 0 ? ring.slice().reverse() : ring;

/** Positive inside the boundary, negative outside (metres). */
export const boundaryDist = (p: Vec2, ring: Vec2[]) => signedDistToPolygon(p, [ring]);

/** Offset a simple ring outward (d > 0) with mitred corners (limited), for the buffer outline. */
export function offsetRing(ring: Vec2[], d: number): Vec2[] {
  const n = ring.length;
  const ccw = polygonArea(ring) > 0;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n],
      c = ring[i],
      q = ring[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]],
      e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1,
      l2 = Math.hypot(e2[0], e2[1]) || 1;
    // outward normal: right of travel for CCW (scene z is flipped, so the sign comes from the area)
    const s = ccw ? -1 : 1;
    const n1 = [(-e1[1] / l1) * s, (e1[0] / l1) * s],
      n2 = [(-e2[1] / l2) * s, (e2[0] / l2) * s];
    let bx = n1[0] + n2[0],
      bz = n1[1] + n2[1];
    const bl = Math.hypot(bx, bz) || 1;
    bx /= bl;
    bz /= bl;
    const k = Math.max(0.4, bx * n1[0] + bz * n1[1]);
    out.push([c[0] + (bx * d) / k, c[1] + (bz * d) / k]);
  }
  return out;
}

/** Signed-distance field over a box, packed for a texture. d in [DMIN, DMAX] metres -> 0..255 (positive = inside). */
export const SDF_MIN = -520;
export const SDF_MAX = 160;
export interface Sdf {
  data: Uint8Array;
  size: number;
  x0: number;
  z0: number;
  w: number;
  h: number;
}
export function buildSdf(ring: Vec2[], size = 384, margin = 520): Sdf {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const [x, z] of ring) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  x0 -= margin;
  z0 -= margin;
  x1 += margin;
  z1 += margin;
  const w = x1 - x0,
    h = z1 - z0;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const d = boundaryDist([x0 + ((i + 0.5) / size) * w, z0 + ((j + 0.5) / size) * h], ring);
      const v = Math.round(
        ((Math.max(SDF_MIN, Math.min(SDF_MAX, d)) - SDF_MIN) / (SDF_MAX - SDF_MIN)) * 255,
      );
      const o = (j * size + i) * 4;
      data[o] = v;
      data[o + 3] = 255;
    }
  return { data, size, x0, z0, w, h };
}
