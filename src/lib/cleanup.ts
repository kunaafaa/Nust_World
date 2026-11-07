/**
 * Production edge cleanup: polygon hygiene for ground layers, boundary clipping of roads/footways, removal of
 * dead-end stubs, and dropping of detail that lies beyond the campus boundary buffer. Pure; returns new data + counts.
 */
import { GROUND_BUFFER, boundaryDist, cleanRing, makeSimple, selfIntersections } from './boundary';
import { centroid, polygonArea } from './geo';
import type { Area, CampusData, Polyline, Vec2 } from './types';

export interface CleanupReport {
  polygons: Record<
    string,
    {
      in: number;
      closedOrDeduped: number;
      selfIntersectionsFixed: number;
      slivers: number;
      outside: number;
      out: number;
    }
  >;
  buildings: { in: number; selfIntersecting: number; outsideDropped: number; out: number };
  roads: { in: number; clipped: number; droppedOutside: number; stubsRemoved: number; out: number };
  footways: {
    in: number;
    clipped: number;
    droppedOutside: number;
    stubsRemoved: number;
    out: number;
  };
  marsh: number;
}

const SLIVER_M2 = 20;
const STUB_M = 8;
const len = (p: Vec2[]) =>
  p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);

function cleanArea(a: Area, rep: CleanupReport['polygons'][string]): Area | null {
  const raw = a.points;
  let pts = cleanRing(raw, 0.3);
  if (pts.length !== raw.length) rep.closedOrDeduped++;
  if (pts.length < 3) {
    rep.slivers++;
    return null;
  }
  const fixed = makeSimple(pts);
  if (fixed.cuts) rep.selfIntersectionsFixed += fixed.cuts;
  pts = fixed.ring;
  if (pts.length < 3 || Math.abs(polygonArea(pts)) < SLIVER_M2) {
    rep.slivers++;
    return null;
  }
  const holes = a.holes
    .map((h) => makeSimple(cleanRing(h, 0.3)).ring)
    .filter((h) => h.length >= 3 && Math.abs(polygonArea(h)) >= 1);
  return { ...a, points: pts, holes };
}

/** Split a polyline into the runs that lie inside (boundary + buffer). Crossing points are found by bisection. */
function clipLine(pts: Vec2[], inside: (p: Vec2) => boolean): Vec2[][] {
  const out: Vec2[][] = [];
  let cur: Vec2[] = [];
  const cross = (a: Vec2, b: Vec2): Vec2 => {
    let lo = 0,
      hi = 1;
    const ia = inside(a);
    for (let i = 0; i < 18; i++) {
      const m = (lo + hi) / 2;
      const p: Vec2 = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
      if (inside(p) === ia) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const ins = inside(p);
    if (i === 0) {
      if (ins) cur.push(p);
      continue;
    }
    const prev = pts[i - 1];
    const pins = inside(prev);
    if (ins && pins) cur.push(p);
    else if (ins && !pins) {
      cur = [cross(prev, p), p];
    } else if (!ins && pins) {
      cur.push(cross(prev, p));
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function lines(ls: Polyline[], inside: (p: Vec2) => boolean) {
  const rep = { in: ls.length, clipped: 0, droppedOutside: 0, stubsRemoved: 0, out: 0 };
  const out: Polyline[] = [];
  for (const l of ls) {
    const runs = clipLine(l.points, inside);
    if (!runs.length) {
      rep.droppedOutside++;
      continue;
    }
    if (runs.length > 1 || runs[0].length !== l.points.length) rep.clipped++;
    runs.forEach((r, i) =>
      out.push({ ...l, id: runs.length > 1 ? `${l.id}#${i}` : l.id, points: r }),
    );
  }
  // Dead-end stubs: a short way with an end that touches nothing else (never counts clipped ends, they are faded).
  const key = (p: Vec2) => `${Math.round(p[0] / 0.5)},${Math.round(p[1] / 0.5)}`;
  const used = new Map<string, number>();
  for (const l of out) for (const p of l.points) used.set(key(p), (used.get(key(p)) ?? 0) + 1);
  const kept = out.filter((l) => {
    if (len(l.points) >= STUB_M) return true;
    const a = l.points[0],
      b = l.points[l.points.length - 1];
    const free = (p: Vec2) => (used.get(key(p)) ?? 0) <= 1;
    if (free(a) || free(b)) {
      rep.stubsRemoved++;
      return false;
    }
    return true;
  });
  rep.out = kept.length;
  return { lines: kept, rep };
}

export function applyBoundary(
  data: CampusData,
  ring: Vec2[] | null,
): { data: CampusData; report: CleanupReport } {
  const polyRep = (n: number) => ({
    in: n,
    closedOrDeduped: 0,
    selfIntersectionsFixed: 0,
    slivers: 0,
    outside: 0,
    out: 0,
  });
  const report: CleanupReport = {
    polygons: {},
    buildings: { in: data.buildings.length, selfIntersecting: 0, outsideDropped: 0, out: 0 },
    roads: { in: 0, clipped: 0, droppedOutside: 0, stubsRemoved: 0, out: 0 },
    footways: { in: 0, clipped: 0, droppedOutside: 0, stubsRemoved: 0, out: 0 },
    marsh: 0,
  };
  // Within the buffer a point may still be drawn: boundaryDist is positive inside, so outside by >30 m is < -30.
  const within = (p: Vec2) => !ring || boundaryDist(p, ring) > -GROUND_BUFFER;
  const area = (name: string, list: Area[]): Area[] => {
    const rep = polyRep(list.length);
    report.polygons[name] = rep;
    const out: Area[] = [];
    for (const a of list) {
      const c = cleanArea(a, rep);
      if (!c) continue;
      // polygons that lie wholly beyond the buffer are not drawn; big ones that cross it are feathered by the shader
      if (ring && !c.points.some(within) && !within(centroid(c.points))) {
        rep.outside++;
        continue;
      }
      out.push(c);
    }
    rep.out = out.length;
    return out;
  };
  const green = area('green', data.green);
  const water = area('water', data.water);
  const bare = area('bare', data.bare);
  const plazas = area('plazas', data.plazas);
  const parking = area('parking', data.parking);
  const pitches = area('pitches', data.pitches);
  const marsh = water.filter((w) => w.kind === 'wetland');
  report.marsh = marsh.length;

  const buildings = data.buildings.filter((b) => {
    if (selfIntersections(b.footprint) > 0) report.buildings.selfIntersecting++;
    if (ring && !within(centroid(b.footprint))) {
      report.buildings.outsideDropped++;
      return false;
    }
    return true;
  });
  report.buildings.out = buildings.length;

  const r = lines(data.roads, within);
  const f = lines(data.footways, within);
  report.roads = r.rep;
  report.footways = f.rep;

  return {
    data: {
      ...data,
      buildings,
      roads: r.lines,
      footways: f.lines,
      green,
      water,
      bare,
      plazas,
      parking,
      pitches,
      marsh,
      boundary: ring ?? undefined,
    },
    report,
  };
}
