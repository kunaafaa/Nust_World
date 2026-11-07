import type { Vec2 } from './types';

/**
 * THE projection. Every position in the app (buildings, roads, trees, cars, labels, routes, GPS dot,
 * minimap) goes through project()/unproject(). Nothing else may convert lat/lng.
 *
 * Local tangent plane on a sphere of radius EARTH_R centred on ORIGIN (azimuthal orthographic about the origin,
 * which is distortion-free to < 1 mm over the 3 km campus). Scene units are metres, north is -Z, east is +X.
 */
export const EARTH_R = 6371008.8;
export const ORIGIN = { lon: 72.9915, lat: 33.643 };

const D2R = Math.PI / 180;
const lat0 = ORIGIN.lat * D2R;
const lon0 = ORIGIN.lon * D2R;
const sin0 = Math.sin(lat0);
const cos0 = Math.cos(lat0);

/** [lon, lat] degrees → scene [x, z] metres. */
export function project(lon: number, lat: number): Vec2 {
  const phi = lat * D2R,
    dl = lon * D2R - lon0;
  const east = EARTH_R * Math.cos(phi) * Math.sin(dl);
  const north = EARTH_R * (cos0 * Math.sin(phi) - sin0 * Math.cos(phi) * Math.cos(dl));
  return [east, -north];
}

/** Scene [x, z] metres → [lon, lat] degrees. Exact inverse of project(). */
export function unproject(x: number, z: number): [number, number] {
  const east = x,
    north = -z;
  const rho = Math.hypot(east, north);
  if (rho < 1e-9) return [ORIGIN.lon, ORIGIN.lat];
  const c = Math.asin(Math.min(1, rho / EARTH_R));
  const sinc = Math.sin(c),
    cosc = Math.cos(c);
  const lat = Math.asin(cosc * sin0 + (north * sinc * cos0) / rho);
  const lon = lon0 + Math.atan2(east * sinc, rho * cos0 * cosc - north * sin0 * sinc);
  return [lon / D2R, lat / D2R];
}

/** Great-circle distance in metres between two [lon, lat] points. */
export function haversine(a: [number, number], b: [number, number]): number {
  const p1 = a[1] * D2R,
    p2 = b[1] * D2R;
  const dp = p2 - p1,
    dl = (b[0] - a[0]) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing, degrees clockwise from north (0..360). */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const p1 = a[1] * D2R,
    p2 = b[1] * D2R,
    dl = (b[0] - a[0]) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}

/** Bearing between two scene points, degrees clockwise from north (north is -Z). */
export function sceneBearingDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b[0] - a[0], -(b[1] - a[1])) / D2R + 360) % 360;
}

/** Campus bounding box [west, south, east, north] used to clip geometry and gate geolocation. */
export const CAMPUS_BBOX: [number, number, number, number] = [72.978, 33.634, 73.004, 33.652];

export function insideCampus(lon: number, lat: number): boolean {
  const [w, s, e, n] = CAMPUS_BBOX;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

/** Scene-space bounds [minX, minZ, maxX, maxZ] */
export const SCENE_BOUNDS = (() => {
  const [w, s, e, n] = CAMPUS_BBOX;
  const a = project(w, n);
  const b = project(e, s);
  return [a[0], a[1], b[0], b[1]] as const;
})();

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function centroid(pts: Vec2[]): Vec2 {
  let x = 0,
    z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

/** Signed area (shoelace). */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function pointInRing(p: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i],
      [xj, zj] = ring[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(p: Vec2, rings: Vec2[][]): boolean {
  if (!pointInRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(p, rings[i])) return false;
  return true;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Signed distance to polygon edge: positive inside, negative outside. */
export function signedDistToPolygon(p: Vec2, rings: Vec2[][]): number {
  let d = Infinity;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      d = Math.min(d, distToSegment(p, ring[j], ring[i]));
  return pointInPolygon(p, rings) ? d : -d;
}

/**
 * Pole of inaccessibility: the point inside the polygon furthest from every edge (best label anchor).
 * Grid-refinement search, precision in metres.
 */
export function polylabel(rings: Vec2[][], precision = 0.5): Vec2 {
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
  const w = maxX - minX,
    h = maxZ - minZ;
  const cell0 = Math.min(w, h);
  if (cell0 === 0) return [minX, minZ];
  type Cell = { x: number; z: number; h: number; d: number; max: number };
  const mk = (x: number, z: number, hh: number): Cell => {
    const d = signedDistToPolygon([x, z], rings);
    return { x, z, h: hh, d, max: d + hh * Math.SQRT2 };
  };
  let queue: Cell[] = [];
  const half = cell0 / 2;
  for (let x = minX; x < maxX; x += cell0)
    for (let z = minZ; z < maxZ; z += cell0) queue.push(mk(x + half, z + half, half));
  const c = centroid(outer);
  let best = mk(c[0], c[1], 0);
  for (const q of queue) if (q.d > best.d) best = q;
  while (queue.length) {
    queue.sort((a, b) => b.max - a.max);
    const cell = queue.shift()!;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const hh = cell.h / 2;
    queue.push(
      mk(cell.x - hh, cell.z - hh, hh),
      mk(cell.x + hh, cell.z - hh, hh),
      mk(cell.x - hh, cell.z + hh, hh),
      mk(cell.x + hh, cell.z + hh, hh),
    );
    if (queue.length > 4000) queue = queue.slice(0, 2000);
  }
  return [best.x, best.z];
}

/** Minimum-area oriented bounding box: { cx, cz, length, width, angle } (angle of the long axis, radians). */
export function orientedBox(ring: Vec2[]) {
  let best = { area: Infinity, cx: 0, cz: 0, length: 0, width: 0, angle: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang),
      s = Math.sin(-ang);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const p of ring) {
      const rx = p[0] * c - p[1] * s,
        rz = p[0] * s + p[1] * c;
      x0 = Math.min(x0, rx);
      x1 = Math.max(x1, rx);
      z0 = Math.min(z0, rz);
      z1 = Math.max(z1, rz);
    }
    const area = (x1 - x0) * (z1 - z0);
    if (area < best.area) {
      const mx = (x0 + x1) / 2,
        mz = (z0 + z1) / 2;
      const cc = Math.cos(ang),
        ss = Math.sin(ang);
      const long = x1 - x0 >= z1 - z0;
      best = {
        area,
        cx: mx * cc - mz * ss,
        cz: mx * ss + mz * cc,
        length: Math.max(x1 - x0, z1 - z0),
        width: Math.min(x1 - x0, z1 - z0),
        angle: long ? ang : ang + Math.PI / 2,
      };
    }
  }
  return best;
}

/** Shrink a simple polygon inward by d metres using vertex bisectors. Returns null if it collapses. */
export function insetRing(ring: Vec2[], d: number): Vec2[] | null {
  const n = ring.length;
  if (n < 3) return null;
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
    // Inward normals (left of travel for CCW polygons in a Y-up frame; our frame flips handedness, so check sign by area).
    const s = ccw ? 1 : -1;
    const n1 = [(-e1[1] / l1) * s, (e1[0] / l1) * s],
      n2 = [(-e2[1] / l2) * s, (e2[0] / l2) * s];
    let bx = n1[0] + n2[0],
      bz = n1[1] + n2[1];
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) {
      bx = n1[0];
      bz = n1[1];
    } else {
      bx /= bl;
      bz /= bl;
    }
    const cosHalf = Math.max(0.3, bx * n1[0] + bz * n1[1]);
    out.push([c[0] + (bx * d) / cosHalf, c[1] + (bz * d) / cosHalf]);
  }
  const a0 = Math.abs(polygonArea(ring)),
    a1 = Math.abs(polygonArea(out));
  if (a1 < 4 || a1 > a0 * 0.98 || polygonArea(out) * polygonArea(ring) < 0) return null;
  if (!out.every((p) => pointInRing(p, ring))) return null;
  return out;
}
