import { dist } from './geo';
import type { Polyline, Vec2 } from './types';

export interface GraphNode {
  id: number;
  pos: Vec2;
  edges: { to: number; w: number }[];
}
export interface Graph {
  nodes: GraphNode[];
  cell: Map<string, number[]>;
  /** endpoints snapped across gaps under GAP_SNAP metres */ snapped: number;
}

export interface RouteStep {
  text: string;
  distance: number;
  at: Vec2;
}
export interface RouteResult {
  path: Vec2[];
  distance: number;
  minutes: number;
  steps: RouteStep[];
}

export interface NamedPoint {
  name: string;
  pos: Vec2;
}

const SNAP = 0.75; // metres: coordinates closer than this merge into one node
export const WALK_SPEED = 1.35; // m/s
const CELL = 40;
export const GAP_SNAP = 5; // metres: dangling path ends closer than this to another path are joined

const key = (p: Vec2) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)}`;
const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

/** Build a walking graph. Footways get a small cost discount over roads so pedestrians prefer paths. */
export function buildGraph(ways: Polyline[]): Graph {
  const index = new Map<string, number>();
  const nodes: GraphNode[] = [];
  const getNode = (p: Vec2) => {
    const k = key(p);
    let id = index.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ id, pos: p, edges: [] });
      index.set(k, id);
    }
    return id;
  };
  for (const way of ways) {
    const factor = ['footway', 'path', 'steps', 'pedestrian', 'track', 'cycleway'].includes(
      way.kind,
    )
      ? 0.9
      : 1;
    let prev = getNode(way.points[0]);
    for (let i = 1; i < way.points.length; i++) {
      const cur = getNode(way.points[i]);
      if (cur === prev) continue;
      const d = dist(nodes[prev].pos, nodes[cur].pos);
      nodes[prev].edges.push({ to: cur, w: d * factor });
      nodes[cur].edges.push({ to: prev, w: d * factor });
      prev = cur;
    }
  }
  // Join dangling ends (degree 1) to the nearest other node or path segment within GAP_SNAP. OSM paths that stop a
  // metre short of a road would otherwise split the graph.
  let snapped = 0;
  const tmpCell = new Map<string, number[]>();
  for (const n of nodes) {
    const k = cellKey(n.pos[0], n.pos[1]);
    const a = tmpCell.get(k);
    if (a) a.push(n.id);
    else tmpCell.set(k, [n.id]);
  }
  const near = (p: Vec2, fn: (id: number) => void) => {
    const cx = Math.floor(p[0] / CELL),
      cz = Math.floor(p[1] / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const id of tmpCell.get(`${cx + dx},${cz + dz}`) ?? []) fn(id);
  };
  const ends = nodes.filter((n) => n.edges.length === 1).map((n) => n.id);
  for (const id of ends) {
    const n = nodes[id];
    let bestNode = -1,
      bd = GAP_SNAP;
    near(n.pos, (o) => {
      if (o === id || n.edges.some((e) => e.to === o)) return;
      const d = dist(n.pos, nodes[o].pos);
      if (d < bd) {
        bd = d;
        bestNode = o;
      }
    });
    if (bestNode >= 0) {
      nodes[id].edges.push({ to: bestNode, w: bd });
      nodes[bestNode].edges.push({ to: id, w: bd });
      snapped++;
      continue;
    }
    // Nearest point on a segment incident to a nearby node (T-junction without a shared node).
    let seg: [number, number, Vec2, number] | null = null;
    let sd = GAP_SNAP;
    near(n.pos, (o) => {
      for (const e of nodes[o].edges) {
        if (e.to === id || o === id) continue;
        const a = nodes[o].pos,
          b = nodes[e.to].pos;
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((n.pos[0] - a[0]) * dx + (n.pos[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
        );
        const q: Vec2 = [a[0] + t * dx, a[1] + t * dz];
        const d = dist(n.pos, q);
        if (d < sd) {
          sd = d;
          seg = [o, e.to, q, d];
        }
      }
    });
    if (seg) {
      const [o1, o2, q] = seg as [number, number, Vec2, number];
      const m = nodes.length;
      nodes.push({ id: m, pos: q, edges: [] });
      for (const o of [o1, o2]) {
        const w = dist(q, nodes[o].pos);
        nodes[m].edges.push({ to: o, w });
        nodes[o].edges.push({ to: m, w });
      }
      nodes[id].edges.push({ to: m, w: sd });
      nodes[m].edges.push({ to: id, w: sd });
      snapped++;
    }
  }

  const cell = new Map<string, number[]>();
  for (const n of nodes) {
    const k = cellKey(n.pos[0], n.pos[1]);
    const arr = cell.get(k);
    if (arr) arr.push(n.id);
    else cell.set(k, [n.id]);
  }
  return { nodes, cell, snapped };
}

/** Keep only the largest connected component so snapped points can always reach each other. */
export function largestComponent(g: Graph): Set<number> {
  const seen = new Int32Array(g.nodes.length).fill(-1);
  let best = { id: -1, size: 0 };
  let comp = 0;
  for (const n of g.nodes) {
    if (seen[n.id] !== -1) continue;
    let size = 0;
    const stack = [n.id];
    seen[n.id] = comp;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const e of g.nodes[c].edges)
        if (seen[e.to] === -1) {
          seen[e.to] = comp;
          stack.push(e.to);
        }
    }
    if (size > best.size) best = { id: comp, size };
    comp++;
  }
  const keep = new Set<number>();
  for (const n of g.nodes) if (seen[n.id] === best.id) keep.add(n.id);
  return keep;
}

export function nearestNode(g: Graph, p: Vec2, allowed?: Set<number>): number {
  let best = -1,
    bd = Infinity;
  for (let r = 0; r < 12 && best === -1; r++) {
    const cx = Math.floor(p[0] / CELL),
      cz = Math.floor(p[1] / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const id of g.cell.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (allowed && !allowed.has(id)) continue;
          const d = dist(g.nodes[id].pos, p);
          if (d < bd) {
            bd = d;
            best = id;
          }
        }
      }
    if (best !== -1) break;
  }
  return best;
}

class MinHeap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(item: [number, number]) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a,
      top = a[0],
      last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function astar(g: Graph, from: number, to: number): number[] | null {
  const n = g.nodes.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  gScore[from] = 0;
  heap.push([dist(g.nodes[from].pos, g.nodes[to].pos), from]);
  const closed = new Uint8Array(n);
  while (heap.size) {
    const [, cur] = heap.pop();
    if (cur === to) {
      const out = [cur];
      while (came[out[0]] !== -1) out.unshift(came[out[0]]);
      return out;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const e of g.nodes[cur].edges) {
      const t = gScore[cur] + e.w;
      if (t < gScore[e.to]) {
        gScore[e.to] = t;
        came[e.to] = cur;
        heap.push([t + dist(g.nodes[e.to].pos, g.nodes[to].pos), e.to]);
      }
    }
  }
  return null;
}

const bearing = (a: Vec2, b: Vec2) => Math.atan2(b[0] - a[0], -(b[1] - a[1]));
const turnDeg = (a: Vec2, b: Vec2, c: Vec2) => {
  let d = ((bearing(b, c) - bearing(a, b)) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
};

function nearestLandmark(p: Vec2, landmarks: NamedPoint[], max: number): NamedPoint | null {
  let best: NamedPoint | null = null,
    bd = max;
  for (const l of landmarks) {
    const d = dist(l.pos, p);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return best;
}

/** Turn-by-turn directions anchored to nearby landmarks instead of street names. */
export function buildSteps(
  path: Vec2[],
  landmarks: NamedPoint[],
  fromName: string,
  toName: string,
): RouteStep[] {
  const steps: RouteStep[] = [];
  let segStart = 0,
    acc = 0;
  const lastNamed = new Set<string>();
  const push = (idx: number, text: string) => {
    steps.push({ text, distance: Math.round(acc), at: path[idx] });
    segStart = idx;
    acc = 0;
  };
  steps.push({ text: `Start at ${fromName}`, distance: 0, at: path[0] });
  for (let i = 1; i < path.length - 1; i++) {
    acc += dist(path[i - 1], path[i]);
    // Look ahead ~12 m so micro-bends in curved paths don't create turns.
    let j = i + 1,
      look = 0;
    while (j < path.length - 1 && look < 12) {
      look += dist(path[j - 1], path[j]);
      j++;
    }
    const turn = turnDeg(path[Math.max(0, i - 2)], path[i], path[j]);
    if (Math.abs(turn) > 40 && acc > 15) {
      const lm = nearestLandmark(path[i], landmarks, 45);
      const dir = turn > 0 ? 'right' : 'left';
      const sharp = Math.abs(turn) > 110 ? 'sharp ' : '';
      const nm = lm && !lastNamed.has(lm.name) ? lm.name : null;
      if (nm) lastNamed.add(nm);
      push(i, nm ? `Turn ${sharp}${dir} at ${nm}` : `Turn ${sharp}${dir}`);
    } else if (acc > 140) {
      const lm = nearestLandmark(path[i], landmarks, 40);
      if (lm && !lastNamed.has(lm.name)) {
        lastNamed.add(lm.name);
        push(i, `Continue past ${lm.name}`);
      }
    }
  }
  acc += dist(path[path.length - 2] ?? path[0], path[path.length - 1]);
  push(path.length - 1, `Arrive at ${toName}`);
  // Shift distances: each step's `distance` is the walk *leading to* that step; display as "walk X m, then ...".
  void segStart;
  return steps;
}

export function findRoute(
  g: Graph,
  allowed: Set<number>,
  from: Vec2,
  to: Vec2,
  landmarks: NamedPoint[],
  fromName: string,
  toName: string,
): RouteResult | null {
  const a = nearestNode(g, from, allowed),
    b = nearestNode(g, to, allowed);
  if (a < 0 || b < 0) return null;
  const ids = a === b ? [a] : astar(g, a, b);
  if (!ids) return null;
  const path: Vec2[] = [from, ...ids.map((i) => g.nodes[i].pos), to];
  let distance = 0;
  for (let i = 1; i < path.length; i++) distance += dist(path[i - 1], path[i]);
  return {
    path,
    distance,
    minutes: Math.max(1, Math.round(distance / WALK_SPEED / 60)),
    steps: buildSteps(path, landmarks, fromName, toName),
  };
}
