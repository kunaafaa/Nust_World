import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundY, terrainActive } from '@/lib/terrain';
import type { Vec2 } from '@/lib/types';

/** Flat ribbon along a polyline at height y, with mitered joins. */
export function ribbon(points: Vec2[], width: number, y: number): THREE.BufferGeometry | null {
  const n = points.length;
  if (n < 2) return null;
  const hw = width / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)],
      next = points[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0],
      dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Normal; scale by miter factor, clamped.
    let nx = -dz,
      nz = dx,
      s = 1;
    if (i > 0 && i < n - 1) {
      const a = Math.atan2(points[i][1] - prev[1], points[i][0] - prev[0]);
      const b = Math.atan2(next[1] - points[i][1], next[0] - points[i][0]);
      let d = Math.abs(a - b);
      if (d > Math.PI) d = 2 * Math.PI - d;
      s = Math.min(1.6, 1 / Math.max(0.5, Math.cos(d / 2)));
    }
    nx *= hw * s;
    nz *= hw * s;
    pos.push(points[i][0] + nx, y, points[i][1] + nz, points[i][0] - nx, y, points[i][1] - nz);
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function dashes(points: Vec2[], dash: number, gap: number): Vec2[][] {
  const out: Vec2[][] = [];
  let carry = 0,
    on = true,
    cur: Vec2[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = 0;
    while (t < len) {
      const step = Math.min(len - t, (on ? dash : gap) - carry);
      const p0: Vec2 = [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len];
      const p1: Vec2 = [
        a[0] + ((b[0] - a[0]) * (t + step)) / len,
        a[1] + ((b[1] - a[1]) * (t + step)) / len,
      ];
      if (on) {
        if (!cur.length) cur.push(p0);
        cur.push(p1);
      }
      t += step;
      carry += step;
      if (carry >= (on ? dash : gap) - 1e-6) {
        if (on && cur.length) {
          out.push(cur);
          cur = [];
        }
        on = !on;
        carry = 0;
      }
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

const open = (r: Vec2[]) =>
  r.length > 1 && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r.slice(0, -1) : r;

/** Flat filled polygon (optionally with holes) at height y. */
export function polygonGeometry(
  points: Vec2[],
  y: number,
  holes: Vec2[][] = [],
): THREE.BufferGeometry | null {
  const pts = open(points);
  if (pts.length < 3) return null;
  try {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes) {
      const hp = open(h);
      if (hp.length >= 3)
        shape.holes.push(new THREE.Path(hp.map(([x, z]) => new THREE.Vector2(x, -z))));
    }
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  } catch {
    return null;
  }
}

export function mergeAll(gs: (THREE.BufferGeometry | null)[]): THREE.BufferGeometry | null {
  const list = gs
    .filter((g): g is THREE.BufferGeometry => !!g)
    .map((g) => {
      const q = g.index ? g.toNonIndexed() : g;
      q.deleteAttribute('uv');
      if (!q.attributes.normal) q.computeVertexNormals();
      return q;
    });
  return list.length ? mergeGeometries(list, false) : null;
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

export function polyBBox(poly: Vec2[]) {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const [x, z] of poly) {
    a = Math.min(a, x);
    b = Math.min(b, z);
    c = Math.max(c, x);
    d = Math.max(d, z);
  }
  return { minX: a, minZ: b, maxX: c, maxZ: d };
}

/** Deterministic PRNG so scatter (trees, cars) is stable across loads. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Terrain draping for ground layers. Subdivides triangles (longest-edge bisection) until no edge is longer than
 * `maxEdge`, then lifts every vertex by groundY(x, z). Returns the input untouched when terrain is off, so the flat
 * map is byte-for-byte what it was.
 */
export function drape(g: THREE.BufferGeometry | null, maxEdge = 14): THREE.BufferGeometry | null {
  if (!g || !terrainActive()) return g;
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position.array;
  const out: number[] = [];
  const stack: number[][] = [];
  const maxSq = maxEdge * maxEdge;
  for (let i = 0; i < p.length; i += 9)
    stack.push([
      p[i],
      p[i + 1],
      p[i + 2],
      p[i + 3],
      p[i + 4],
      p[i + 5],
      p[i + 6],
      p[i + 7],
      p[i + 8],
    ]);
  while (stack.length) {
    const t = stack.pop()!;
    const d = (a: number, b: number) =>
      (t[a] - t[b]) ** 2 + (t[a + 1] - t[b + 1]) ** 2 + (t[a + 2] - t[b + 2]) ** 2;
    const e = [d(0, 3), d(3, 6), d(6, 0)];
    const m = e.indexOf(Math.max(...e));
    if (e[m] <= maxSq || stack.length > 400000) {
      for (let k = 0; k < 9; k += 3) out.push(t[k], t[k + 1] + groundY(t[k], t[k + 2]), t[k + 2]);
      continue;
    }
    // split the longest edge a-b at its midpoint; c is the opposite vertex
    const ia = m * 3,
      ib = ((m + 1) % 3) * 3,
      ic = ((m + 2) % 3) * 3;
    const mx = (t[ia] + t[ib]) / 2,
      my = (t[ia + 1] + t[ib + 1]) / 2,
      mz = (t[ia + 2] + t[ib + 2]) / 2;
    stack.push(
      [t[ia], t[ia + 1], t[ia + 2], mx, my, mz, t[ic], t[ic + 1], t[ic + 2]],
      [mx, my, mz, t[ib], t[ib + 1], t[ib + 2], t[ic], t[ic + 1], t[ic + 2]],
    );
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  r.computeVertexNormals();
  return r;
}
