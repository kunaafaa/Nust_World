/**
 * Builds the topo merge. Primary source: Overture Maps (direct download in data/overture, ODbL). The TopoExport files in
 * reference/ are used (a) to cross-check Overture, (b) for individual trees (canopy model, CC BY 4.0) and (c) for 5 m
 * contours (EDTM 30 m, CC BY 4.0). Reads only; writes: data/topo-buildings.geojson, public/data/topo-merge.json,
 * public/data/topo-trees.json, public/data/topo-terrain.json, docs/.topo-merge-stats.json.
 * nust-full.geojson, landmarks.ts and heights.ts are never touched.
 *
 * Run: npx tsx scripts/build-topo-merge.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGraph, largestComponent } from '../src/lib/routing';
import {
  centroid,
  pointInRing,
  polygonArea,
  project,
  unproject,
  distToSegment,
} from '../src/lib/geo';
import type { TopoMergeFile } from '../src/lib/topoMerge';
import type { Polyline, Vec2 } from '../src/lib/types';
import {
  bbox,
  iou,
  loadOurs,
  loadOvBuildings,
  loadOvSegments,
  type OvBuilding,
} from './lib/sources';
import { loadTopo, parseBinaryDxf, lwVerts, xyz, nums } from './lib/topo';
import { fromUtm } from './lib/utm';

/** Fitted UTM 43N origin of each export's local frame (see docs/topo-merge-report.md): residual 0.004 m median. */
const UTM_ORIGIN: Record<string, [number, number]> = {
  '18D98C': [313072.324, 3724147.568],
  '9CF709': [312931.529, 3723881.375],
};
const OVR = JSON.parse(readFileSync('data/topo-overrides.json', 'utf8')) as {
  excludeUpstream: string[];
};
/** An Overture feature is excluded when EVERY upstream dataset it came from is on the override list. */
const excludedUp = (u: string) => u.split(' + ').every((x) => OVR.excludeUpstream.includes(x));
const excluded: { id: string; kind: string; areaM2: number; upstream: string; at: string }[] = [];
const RELEASE = readFileSync('data/overture/overture-release.txt', 'utf8').trim();
const ATTRIBUTION =
  '© OpenStreetMap contributors · Overture Maps Foundation · terrain/canopy data CC BY 4.0 (per the export licence files)';

const ll = (p: Vec2) => unproject(p[0], p[1]) as [number, number];
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const llRing = (r: Vec2[]): [number, number][] =>
  r.map((p) => {
    const [a, b] = ll(p);
    return [r6(a), r6(b)];
  });
const area = (r: Vec2[]) => Math.abs(polygonArea(r));
const inAny = (p: Vec2, rings: Vec2[][]) => rings.some((r) => pointInRing(p, r));
const lattice = (r: Vec2[], step: number): Vec2[] => {
  const [a, b, c, d] = bbox(r);
  const out: Vec2[] = [];
  for (let z = b + step / 2; z < d; z += step)
    for (let x = a + step / 2; x < c; x += step) if (pointInRing([x, z], r)) out.push([x, z]);
  return out;
};
const bboxHit = (a: [number, number, number, number], b: [number, number, number, number], m = 0) =>
  !(a[2] < b[0] - m || a[0] > b[2] + m || a[3] < b[1] - m || a[1] > b[3] + m);
function selfIntersects(r: Vec2[]): boolean {
  const n = r.length;
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = r[i],
        b = r[(i + 1) % n],
        c = r[j],
        d = r[(j + 1) % n];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
    }
  return false;
}

// ───────── sources ─────────
const ours = loadOurs();
const ov = loadOvBuildings();
const seg = loadOvSegments();
const topos = (['18D98C', '9CF709'] as const).map((n) => {
  const t = loadTopo(`reference/topoexport-${n}`, n);
  const [E0, N0] = UTM_ORIGIN[n];
  const toLL = (p: Vec2): [number, number] => fromUtm(E0 + p[0], N0 + p[1]);
  const tr = (p: Vec2): Vec2 => project(...toLL(p));
  return { n, t, toLL, tr };
});
const frames: Vec2[][] = topos.map(({ t, tr }) =>
  [
    [0, 0],
    [t.extent[0], 0],
    [t.extent[0], t.extent[1]],
    [0, t.extent[1]],
  ].map((p) => tr(p as Vec2)),
);
const inRegion = (p: Vec2) => inAny(p, frames);
const region = frames.map(llRing);

// ───────── verify the fit again after conversion (topo -> WGS84 -> scene vs Overture direct) ─────────
const fitCheck: Record<
  string,
  { n: number; medianCentroidM: number; p90CentroidM: number; medianIoU: number }
> = {};
for (const { n, t, tr } of topos) {
  const ds: number[] = [],
    is: number[] = [];
  for (const b of t.buildings) {
    const rg = b.ring.map(tr),
      c = centroid(rg);
    let best: OvBuilding | null = null,
      bd = 1e9;
    for (const o of ov) {
      const oc = centroid(o.ring);
      const d = Math.hypot(oc[0] - c[0], oc[1] - c[1]);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best && bd < 8) {
      ds.push(bd);
      is.push(iou(rg, best.ring));
    }
  }
  ds.sort((a, b) => a - b);
  is.sort((a, b) => a - b);
  fitCheck[n] = {
    n: ds.length,
    medianCentroidM: +ds[Math.floor(ds.length / 2)].toFixed(3),
    p90CentroidM: +ds[Math.floor(ds.length * 0.9)].toFixed(3),
    medianIoU: +is[Math.floor(is.length / 2)].toFixed(3),
  };
}
console.log('fit check', fitCheck);

// ───────── buildings ─────────
const osmB = ours.buildings.filter((b) => !(b.provisional && !b.source));
const osmBB = osmB.map((b) => bbox(b.footprint));
const osmArea = osmB.map((b) => area(b.footprint));
const regionOv = ov.filter((o) => inRegion(centroid(o.ring)));
const topoRings = topos.flatMap(({ t, tr }) => t.buildings.map((b) => b.ring.map(tr)));
const topoBB = topoRings.map(bbox);
const crossTopo = (o: OvBuilding) => {
  const bb = bbox(o.ring);
  let best = 0;
  topoRings.forEach((r, i) => {
    if (bboxHit(bb, topoBB[i])) best = Math.max(best, iou(o.ring, r));
  });
  return best;
};

interface Cls {
  o: OvBuilding;
  maxIou: number;
  bestOsm: number;
  cover: number;
  topoIou: number;
  clean: boolean;
}
const cls: Cls[] = regionOv.map((o) => {
  const bb = bbox(o.ring);
  let maxIou = 0,
    bestOsm = -1;
  osmB.forEach((b, i) => {
    if (!bboxHit(bb, osmBB[i])) return;
    const v = iou(o.ring, b.footprint);
    if (v > maxIou) {
      maxIou = v;
      bestOsm = i;
    }
  });
  const pts = lattice(o.ring, 1.5);
  const near = osmB
    .map((b, i) => (bboxHit(bb, osmBB[i]) ? b.footprint : null))
    .filter((x): x is Vec2[] => !!x);
  const cover = pts.length ? pts.filter((p) => inAny(p, near)).length / pts.length : 0;
  return {
    o,
    maxIou,
    bestOsm,
    cover,
    topoIou: crossTopo(o),
    clean: !selfIntersects(o.ring) && o.ring.length >= 3,
  };
});
const conf = (c: Cls): 'high' | 'medium' | 'low' =>
  c.maxIou > 0.6 || /OpenStreetMap/.test(c.o.upstream)
    ? 'high'
    : c.o.area >= 200 && c.topoIou > 0.9
      ? 'medium'
      : 'low';

// ── hostel areas / named points ──
const hostelAreas = ours.bare.filter(
  (a) => a.kind === 'residential' && /hostel/i.test(a.name ?? ''),
);
const HOSTEL_NAME =
  /hostel|ghazali|attar|liaquat|rumi|razi|fatima|rehmat|rahmat|zakar|hajveri|ayesha|khadija|zainab|amna|villas/i;
const hostelPoints = ours.points.filter((p) => p.name && HOSTEL_NAME.test(p.name));
const osmNamedHostels = ours.places.filter((p) => p.category === 'hostel');

const noOsm = (c: Cls) => c.cover < 0.25 && c.maxIou < 0.3;
const additions: TopoMergeFile['additions'] = [];
let hostels: TopoMergeFile['hostels'] = [];
const groupExcluded = new Set<string>();
const flags: TopoMergeFile['flags'] = [];
const replacements: TopoMergeFile['replacements'] = [];
const action = new Map<string, string>();
const hostelLog: { name: string; via: string; areaM2: number; id: string; at: string }[] = [];
const skippedSmall: number[] = [];

for (const c of cls) {
  const { o } = c;
  if (!noOsm(c)) continue;
  if (o.area < 100) {
    action.set(o.id, 'skipped (under 100 m², no OSM counterpart)');
    skippedSmall.push(o.area);
    continue;
  }
  const cen = centroid(o.ring);
  const at = `${ll(cen)[1].toFixed(5)}, ${ll(cen)[0].toFixed(5)}`;
  const isExcluded = excludedUp(o.upstream);
  const drop = (kind: string) => {
    excluded.push({ id: o.id, kind, areaM2: Math.round(o.area), upstream: o.upstream, at });
    action.set(o.id, `excluded by override (upstream: ${o.upstream})`);
  };
  // Rule 3: hostels — by named OSM point inside the outline, else by OSM hostel area polygon containing it
  const pt = hostelPoints.find((p) => pointInRing(p.pos, o.ring));
  const ar = hostelAreas.find((a) => pointInRing(cen, a.points));
  if (pt || ar) {
    const name = pt ? pt.name! : ar!.name!.replace(/\s+area$/i, '');
    const slugId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const existing = osmNamedHostels.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const placeId = existing ? existing.id : `topo-${slugId}`;
    if (isExcluded) {
      groupExcluded.add(placeId);
      drop(`hostel footprint (${name})`);
      continue;
    }
    hostels.push({
      id: o.id,
      ring: llRing(o.ring),
      source: 'overture',
      upstream: o.upstream,
      confidence: conf(c),
      areaM2: Math.round(o.area),
      placeId,
      placeName: name,
      via: pt ? 'point' : 'area',
      areaId: pt ? pt.id : ar!.id,
    });
    hostelLog.push({
      name,
      via: pt ? `OSM point ${pt.id}` : `OSM area ${ar!.id}`,
      areaM2: Math.round(o.area),
      id: o.id,
      at,
    });
    action.set(o.id, `hostel footprint: ${name}`);
    continue;
  }
  if (isExcluded) {
    drop('addition');
    continue;
  }
  additions.push({
    id: o.id,
    ring: llRing(o.ring),
    source: 'overture',
    upstream: o.upstream,
    confidence: conf(c),
    areaM2: Math.round(o.area),
  });
  action.set(o.id, 'added (provisional)');
}
// A hostel group is applied only if NONE of its outlines were excluded: a partial set would replace the provisional
// block with some of the buildings and silently drop the rest. Deferred groups keep what they had before.
const deferredHostels = hostels.filter((h) => groupExcluded.has(h.placeId));
for (const h of deferredHostels)
  action.set(
    h.id,
    `hostel footprint deferred: other outlines in "${h.placeName}" are excluded by override`,
  );
hostels = hostels.filter((h) => !groupExcluded.has(h.placeId));
// Razi etc: provisional blocks from an area polygon are replaced only where real outlines were found in that area
const provisionalAreas = ours.places.filter((p) => p.provisional && p.category === 'hostel');
const replacedProvisional = provisionalAreas
  .filter((p) => hostels.some((h) => h.placeId === p.id))
  .map((p) => p.name);

// ── Rule 1: defective OSM outlines ──
// Exact duplicate ways (same outline): suppress the unnamed copy so the two do not z-fight
const suppressed: { target: string; duplicateOf: string; reason: string }[] = [];
const placed = new Set(ours.buildings.filter((b) => b.placeId).map((b) => b.id));
osmB.forEach((b, i) => {
  for (let j = i + 1; j < osmB.length; j++) {
    if (!bboxHit(osmBB[i], osmBB[j])) continue;
    if (Math.abs(osmArea[i] - osmArea[j]) > 0.05 * Math.max(osmArea[i], osmArea[j])) continue;
    const v = iou(b.footprint, osmB[j].footprint);
    if (v < 0.95) continue;
    const keepI = placed.has(b.id) || (!placed.has(osmB[j].id) && b.id < osmB[j].id);
    const dropB = keepI ? osmB[j] : b;
    const keepB = keepI ? b : osmB[j];
    if (suppressed.some((x) => x.target === dropB.id)) continue;
    suppressed.push({
      target: dropB.id,
      duplicateOf: keepB.id,
      reason: `exact duplicate outline of ${keepB.name ?? keepB.id} (IoU ${v.toFixed(2)}); the copy without a name/place is suppressed to stop z-fighting`,
    });
  }
});
const dupIds = new Set(suppressed.flatMap((s) => [s.target, s.duplicateOf]));

const defects: { id: string; name?: string; kind: string }[] = [];
osmB.forEach((b, i) => {
  if (b.offCampus) return;
  const why: string[] = [];
  if (selfIntersects(b.footprint)) why.push('self-overlapping');
  for (let j = 0; j < osmB.length; j++) {
    if (j === i || !bboxHit(osmBB[i], osmBB[j])) continue;
    if (dupIds.has(b.id) && dupIds.has(osmB[j].id)) continue; // handled as an exact duplicate
    const small = Math.min(osmArea[i], osmArea[j]);
    if (small < 20) continue;
    const pts = lattice(osmArea[i] <= osmArea[j] ? b.footprint : osmB[j].footprint, 1.0);
    const other = osmArea[i] <= osmArea[j] ? osmB[j].footprint : b.footprint;
    const frac = pts.length ? pts.filter((p) => pointInRing(p, other)).length / pts.length : 0;
    if (frac > 0.08 && i < j)
      why.push(
        `overlaps ${osmB[j].name ?? osmB[j].id} (${Math.round(frac * 100)}% of the smaller)`,
      );
  }
  // merged: contains >=2 distinct Overture buildings that each sit mostly inside it
  const inside = cls.filter(
    (c) =>
      c.bestOsm === i ||
      (c.o.area >= 60 &&
        bboxHit(bbox(c.o.ring), osmBB[i]) &&
        lattice(c.o.ring, 2).filter((p) => pointInRing(p, b.footprint)).length /
          Math.max(1, lattice(c.o.ring, 2).length) >
          0.7),
  );
  const big = inside.filter((c) => c.o.area >= 60);
  if (
    big.length >= 2 &&
    osmArea[i] < big.reduce((s, c) => s + c.o.area, 0) * 1.3 &&
    osmArea[i] > 1.4 * Math.max(...big.map((c) => c.o.area))
  )
    why.push(`merged (contains ${big.length} separate Overture outlines)`);
  if (why.length) defects.push({ id: b.id, name: b.name, kind: why.join('; ') });
});
for (const d of defects) {
  const i = osmB.findIndex((b) => b.id === d.id);
  const m = cls.find((c) => c.bestOsm === i && c.maxIou > 0.6 && c.clean);
  const cleanVsNeighbours = (rg: Vec2[]) =>
    !osmB.some((b, j) => j !== i && bboxHit(bbox(rg), osmBB[j]) && iou(rg, b.footprint) > 0.05);
  if (/self-overlapping|overlaps/.test(d.kind) && m && cleanVsNeighbours(m.o.ring)) {
    replacements.push({
      target: d.id,
      parts: [llRing(m.o.ring)],
      reason: d.kind,
      iou: +m.maxIou.toFixed(3),
      source: `overture: ${m.o.upstream}`,
    });
    action.set(m.o.id, `replaced OSM ${d.id}`);
  }
  // merged outlines are only flagged, never auto-split: a named landmark keeps its OSM outline
}
const defectsKept = defects.filter((d) => !replacements.some((r) => r.target === d.id));

// ── Rule 4: OSM vs Overture differ by more than 3 m (same-size match) ──
const disagreements: { id: string; name?: string; offM: number; bearing: number }[] = [];
for (const c of cls) {
  if (c.bestOsm < 0 || c.maxIou < 0.3) continue;
  const b = osmB[c.bestOsm];
  const ratio = c.o.area / osmArea[c.bestOsm];
  if (ratio < 0.8 || ratio > 1.25) continue;
  const oc = centroid(c.o.ring),
    bc = centroid(b.footprint);
  const off = Math.hypot(oc[0] - bc[0], oc[1] - bc[1]);
  if (off > 3 && !disagreements.some((d) => d.id === b.id)) {
    const brg = ((Math.atan2(oc[0] - bc[0], -(oc[1] - bc[1])) * 180) / Math.PI + 360) % 360;
    disagreements.push({ id: b.id, name: b.name, offM: +off.toFixed(1), bearing: Math.round(brg) });
    flags.push({
      id: b.id,
      reason: `OSM and Overture/topo outlines differ by ${off.toFixed(1)} m (bearing ${Math.round(brg)}°); OSM kept, check on site`,
    });
  }
}

// ───────── roads ─────────
const existing: Polyline[] = [...ours.roads, ...ours.footways];
const eBB = existing.map((l) => bbox(l.points));
const nearExisting = (p: Vec2, r: number) => {
  for (let k = 0; k < existing.length; k++) {
    const bb = eBB[k];
    if (p[0] < bb[0] - r || p[0] > bb[2] + r || p[1] < bb[1] - r || p[1] > bb[3] + r) continue;
    const pts = existing[k].points;
    for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= r) return true;
  }
  return false;
};
const snapPoint = (p: Vec2, r: number): { p: Vec2; snapped: boolean } => {
  let best: Vec2 | null = null,
    bd = r;
  for (let k = 0; k < existing.length; k++) {
    const bb = eBB[k];
    if (p[0] < bb[0] - r || p[0] > bb[2] + r || p[1] < bb[1] - r || p[1] > bb[3] + r) continue;
    const pts = existing[k].points;
    for (const q of pts) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  if (best) return { p: [best[0], best[1]], snapped: true };
  bd = r;
  for (let k = 0; k < existing.length; k++) {
    const pts = existing[k].points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        l2 = dx * dx + dz * dz;
      if (l2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
      const q: Vec2 = [a[0] + t * dx, a[1] + t * dz];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best ? { p: best, snapped: true } : { p, snapped: false };
};
const roadsOut: TopoMergeFile['roads'] = [];
let roadSkippedOutside = 0,
  roadAlready = 0;
for (const s of seg) {
  if (s.pts.filter((p) => inRegion(p)).length < s.pts.length * 0.6) {
    roadSkippedOutside++;
    continue;
  }
  // sample every 3 m, find runs not already mapped within 5 m
  const samples: { p: Vec2; d: number; covered: boolean }[] = [];
  let acc = 0;
  for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1],
      b = s.pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < L; t += 3) {
      const p: Vec2 = [a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L];
      samples.push({ p, d: acc + t, covered: nearExisting(p, 5) });
    }
    acc += L;
  }
  const last = s.pts[s.pts.length - 1];
  samples.push({ p: last, d: acc, covered: nearExisting(last, 5) });
  if (samples.every((x) => x.covered)) {
    roadAlready++;
    continue;
  }
  let run: typeof samples = [];
  const flush = () => {
    if (run.length >= 2 && run[run.length - 1].d - run[0].d >= 12) {
      const pts = run.map((x) => x.p);
      const a = snapPoint(pts[0], 3),
        b = snapPoint(pts[pts.length - 1], 3);
      pts[0] = a.p;
      pts[pts.length - 1] = b.p;
      // simplify: drop points closer than 1 m to the previous kept one
      const simp: Vec2[] = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++)
        if (
          Math.hypot(pts[i][0] - simp[simp.length - 1][0], pts[i][1] - simp[simp.length - 1][1]) > 3
        )
          simp.push(pts[i]);
      simp.push(pts[pts.length - 1]);
      roadsOut.push({
        id: `${s.id}@${Math.round(run[0].d)}`,
        cls: s.cls,
        name: s.name,
        upstream: s.upstream,
        pts: simp.map((p) => {
          const [x, y] = ll(p);
          return [r6(x), r6(y)];
        }),
        snapped: (a.snapped ? 1 : 0) + (b.snapped ? 1 : 0),
      });
    }
    run = [];
  };
  for (const x of samples) {
    if (!x.covered) run.push(x);
    else flush();
  }
  flush();
}
// connectivity before/after
const toPoly = (r: TopoMergeFile['roads'][number]): Polyline => ({
  id: r.id,
  kind: r.cls,
  points: r.pts.map(([x, y]) => project(x, y)),
});
const g0 = buildGraph(existing);
const g1 = buildGraph([...existing, ...roadsOut.map(toPoly)]);
const conn = {
  before: { nodes: g0.nodes.length, largest: largestComponent(g0).size },
  after: { nodes: g1.nodes.length, largest: largestComponent(g1).size },
  newSegments: roadsOut.length,
  newMetres: Math.round(
    roadsOut.reduce(
      (s, r) =>
        s +
        r.pts.reduce(
          (a, p, i) =>
            i
              ? a +
                Math.hypot(
                  ...(project(p[0], p[1]).map(
                    (v, k) => v - project(r.pts[i - 1][0], r.pts[i - 1][1])[k],
                  ) as [number, number]),
                )
              : 0,
          0,
        ),
      0,
    ),
  ),
  endpointsSnapped: roadsOut.reduce((s, r) => s + r.snapped, 0),
  skippedOutsideRegion: roadSkippedOutside,
  alreadyMapped: roadAlready,
};

// ───────── green gaps (topo 2D green spaces vs our ground) ─────────
const ground = [
  ...ours.green,
  ...ours.bare,
  ...ours.pitches,
  ...ours.parking,
  ...ours.water,
  ...ours.plazas,
].map((a) => a.points);
const bld = osmB.map((b) => b.footprint);
const greenOut: TopoMergeFile['green'] = [];
let greenSeen = 0;
const greenCov: number[] = [];
for (const { t, tr } of topos) {
  for (const g of t.green) {
    const rg = g.map(tr);
    if (rg.length < 3) continue;
    greenSeen++;
    const a = area(rg);
    if (a < 400) continue;
    const pts = lattice(rg, 4);
    const cov = pts.length
      ? pts.filter((p) => inAny(p, ground) || inAny(p, bld)).length / pts.length
      : 1;
    greenCov.push(cov);
    if (cov >= 0.35) continue;
    const c = centroid(rg);
    if (
      greenOut.some(
        (x) =>
          Math.hypot(
            centroid(x.ring.map((q) => project(q[0], q[1])))[0] - c[0],
            centroid(x.ring.map((q) => project(q[0], q[1])))[1] - c[1],
          ) < 6,
      )
    )
      continue;
    greenOut.push({
      id: `topo-green-${greenOut.length + 1}`,
      ring: llRing(rg),
      upstream: 'Overture Base (ODbL), via TopoExport',
    });
  }
}

// ───────── trees (INSERT blocks from the 3D files; sizes from block geometry) ─────────
const treeAcc: { p: Vec2; h: number; r: number }[] = [];
for (const { n, t, tr } of topos) {
  void t;
  const d = parseBinaryDxf(`reference/topoexport-${n}/topoexport_3D_modeling.dxf`);
  const size: Record<string, { h: number; r: number }> = {};
  for (const [k, es] of Object.entries(d.blocks)) {
    const v = es.flatMap((e) => xyz(e));
    if (!v.length) continue;
    size[k] = { h: Math.max(...v.map((q) => q[2])), r: Math.max(...v.map((q) => Math.abs(q[0]))) };
  }
  const [E0, N0] = UTM_ORIGIN[n];
  for (const e of d.ents) {
    if (e.layer !== 'TPX_VEGETATION_TREES_INDIVIDUAL' || e.type !== 'INSERT') continue;
    const bn = String(e.g.find((g) => g[0] === 2)?.[1]);
    const sz = size[bn];
    if (!sz) continue;
    const [x, y] = [nums(e, 10)[0], nums(e, 20)[0]];
    const p = project(...fromUtm(E0 + x, N0 + y));
    if (treeAcc.some((q) => Math.abs(q.p[0] - p[0]) < 0.6 && Math.abs(q.p[1] - p[1]) < 0.6))
      continue; // same tree in both exports
    treeAcc.push({ p, h: sz.h, r: sz.r });
  }
  void tr;
}
const treesFlat: number[] = [];
for (const t of treeAcc) {
  const [x, y] = ll(t.p);
  treesFlat.push(r6(x), r6(y), +t.h.toFixed(1), +t.r.toFixed(1));
}
const treeSizes: Record<string, number> = {};
treeAcc.forEach((t) => (treeSizes[`h${t.h}/r${t.r}`] = (treeSizes[`h${t.h}/r${t.r}`] || 0) + 1));

// ───────── terrain from the 5 m contours (EDTM 30 m source) ─────────
const cp: { p: Vec2; z: number }[] = [];
const meshPts: { p: Vec2; z: number }[] = [];
for (const { t, tr } of topos) {
  for (const c of t.contours) {
    for (let i = 1; i < c.pts.length; i++) {
      const a = tr(c.pts[i - 1]),
        b = tr(c.pts[i]);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let k = 0; k < Math.max(1, Math.floor(L / 8)); k++)
        cp.push({
          p: [a[0] + ((b[0] - a[0]) * k * 8) / L, a[1] + ((b[1] - a[1]) * k * 8) / L],
          z: c.z,
        });
    }
  }
  for (const v of t.terrain) meshPts.push({ p: tr([v[0], v[1]]), z: v[2] });
}
const all = frames.flat();
const [gx0, gz0, gx1, gz1] = bbox(all);
const CELL = 20;
const cols = Math.ceil((gx1 - gx0) / CELL) + 1,
  rows = Math.ceil((gz1 - gz0) / CELL) + 1;
let raw = new Float64Array(cols * rows);
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++) {
    const p: Vec2 = [gx0 + c * CELL, gz0 + r * CELL];
    // nearest contour point, then nearest contour of a DIFFERENT elevation: linear interpolation between them
    let d1 = 1e9,
      z1 = 0;
    for (const q of cp) {
      const d = Math.hypot(q.p[0] - p[0], q.p[1] - p[1]);
      if (d < d1) {
        d1 = d;
        z1 = q.z;
      }
    }
    let d2 = 1e9,
      z2 = z1;
    for (const q of cp)
      if (q.z !== z1) {
        const d = Math.hypot(q.p[0] - p[0], q.p[1] - p[1]);
        if (d < d2) {
          d2 = d;
          z2 = q.z;
        }
      }
    raw[r * cols + c] = d1 < 1e-6 ? z1 : (z1 * d2 + z2 * d1) / (d1 + d2);
  }
// Gaussian smoothing, sigma ~ 2 cells (40 m): the source is a 30 m model
const smooth = (src: Float64Array, sigma: number) => {
  const rad = Math.ceil(sigma * 3),
    k: number[] = [];
  for (let i = -rad; i <= rad; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const ks = k.reduce((a, b) => a + b, 0);
  const tmp = new Float64Array(src.length),
    out = new Float64Array(src.length);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0,
        w = 0;
      for (let i = -rad; i <= rad; i++) {
        const cc = Math.min(cols - 1, Math.max(0, c + i));
        s += src[r * cols + cc] * k[i + rad];
        w += k[i + rad];
      }
      tmp[r * cols + c] = s / w;
    }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0,
        w = 0;
      for (let i = -rad; i <= rad; i++) {
        const rr = Math.min(rows - 1, Math.max(0, r + i));
        s += tmp[rr * cols + c] * k[i + rad];
        w += k[i + rad];
      }
      out[r * cols + c] = s / w;
    }
  void ks;
  return out;
};
raw = smooth(raw, 2);
const hAt = (x: number, z: number) => {
  const fx = (x - gx0) / CELL,
    fz = (z - gz0) / CELL;
  const c = Math.max(0, Math.min(cols - 1.001, fx)),
    r = Math.max(0, Math.min(rows - 1.001, fz));
  const c0 = Math.floor(c),
    r0 = Math.floor(r),
    tx = c - c0,
    tz = r - r0;
  const v = (rr: number, cc: number) => raw[rr * cols + cc];
  return (
    v(r0, c0) * (1 - tx) * (1 - tz) +
    v(r0, c0 + 1) * tx * (1 - tz) +
    v(r0 + 1, c0) * (1 - tx) * tz +
    v(r0 + 1, c0 + 1) * tx * tz
  );
};
const errs = meshPts.filter((m) => inRegion(m.p)).map((m) => hAt(m.p[0], m.p[1]) - m.z);
const rms = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
const maxErr = Math.max(...errs.map(Math.abs));
const ctrErrs = cp.filter((q) => inRegion(q.p)).map((q) => hAt(q.p[0], q.p[1]) - q.z);
const ctrRms = Math.sqrt(ctrErrs.reduce((s, e) => s + e * e, 0) / ctrErrs.length);
const zRef = hAt(0, 0);
const vals = Array.from(raw, (v) => +(v - zRef).toFixed(1));
const zmin = Math.min(...raw),
  zmax = Math.max(...raw);
const terrain = {
  version: 1,
  source:
    'EDTM 30 m (OpenGeoHub, CC BY 4.0) via TopoExport 5 m contours; interpolated and smoothed. Approximate.',
  x0: gx0,
  z0: gz0,
  cell: CELL,
  cols,
  rows,
  zRefElevation: +zRef.toFixed(1),
  minElevation: +zmin.toFixed(1),
  maxElevation: +zmax.toFixed(1),
  values: vals,
};

// ───────── write outputs ─────────
const merge: TopoMergeFile = {
  version: 1,
  generated: new Date().toISOString(),
  overtureRelease: RELEASE,
  attribution: ATTRIBUTION,
  region,
  additions,
  replacements,
  suppressed,
  hostels,
  flags,
  roads: roadsOut,
  green: greenOut,
};
writeFileSync('public/data/topo-merge.json', JSON.stringify(merge));
writeFileSync('public/data/topo-trees.json', JSON.stringify({ version: 1, trees: treesFlat }));
writeFileSync('public/data/topo-terrain.json', JSON.stringify(terrain));
const feature = (c: Cls) => ({
  type: 'Feature',
  properties: {
    id: c.o.id,
    source: 'overture',
    overtureRelease: RELEASE,
    upstream: c.o.upstream,
    confidence: conf(c),
    areaM2: Math.round(c.o.area),
    osmMatch: c.bestOsm >= 0 && c.maxIou > 0.3 ? osmB[c.bestOsm].id : null,
    osmIoU: +c.maxIou.toFixed(3),
    topoCrossCheckIoU: +c.topoIou.toFixed(3),
    overtureHeight: c.o.height ?? null,
    overtureFloors: c.o.floors ?? null,
    action:
      action.get(c.o.id) ??
      (c.maxIou > 0.6
        ? 'matched (OSM geometry kept)'
        : c.cover >= 0.25
          ? 'overlaps OSM (OSM kept)'
          : 'skipped'),
    license: 'ODbL-1.0 (Overture Maps Foundation, ' + c.o.upstream + ')',
  },
  geometry: { type: 'Polygon', coordinates: [[...llRing(c.o.ring), llRing(c.o.ring)[0]]] },
});
// Features whose only upstream is on the override exclusion list are left out of the written file (ids go in the stats).
writeFileSync(
  'data/topo-buildings.geojson',
  JSON.stringify({
    type: 'FeatureCollection',
    attribution: ATTRIBUTION,
    features: cls.filter((c) => !excludedUp(c.o.upstream)).map(feature),
  }),
);

const matched = cls.filter((c) => c.maxIou > 0.6).length;
const stats = {
  generated: merge.generated,
  overtureRelease: RELEASE,
  overtureDirect: {
    total: ov.length,
    inRegion: regionOv.length,
    upstream: ov.reduce<Record<string, number>>(
      (m, o) => ((m[o.upstream] = (m[o.upstream] || 0) + 1), m),
      {},
    ),
  },
  fitCheck,
  buildings: {
    regionOverture: regionOv.length,
    matchedOSM: matched,
    overlapOnly: cls.filter((c) => c.maxIou <= 0.6 && c.cover >= 0.25).length,
    noOsm: cls.filter(noOsm).length,
    skippedUnder100: skippedSmall.length,
    additions: additions.length,
    hostelFootprints: hostels.length,
    additionsByConfidence: additions.reduce<Record<string, number>>(
      (m, a) => ((m[a.confidence] = (m[a.confidence] || 0) + 1), m),
      {},
    ),
    additionsByUpstream: additions.reduce<Record<string, number>>(
      (m, a) => ((m[a.upstream] = (m[a.upstream] || 0) + 1), m),
      {},
    ),
    additionsAreaM2: additions.reduce((s, a) => s + a.areaM2, 0),
    topoCrossCheckedOver90: cls.filter((c) => c.topoIou > 0.9).length,
    excludedByOverride: excluded,
    excludeUpstream: OVR.excludeUpstream,
    suppressed,
    defectsFound: defects,
    defectsKept: defectsKept.map((d) => d.id),
    replacements: replacements.map((r) => ({ target: r.target, reason: r.reason, iou: r.iou })),
    disagreements,
    hostelLog,
    replacedProvisional,
    deferredHostels: deferredHostels.map((h) => ({
      place: h.placeName,
      id: h.id,
      areaM2: h.areaM2,
      upstream: h.upstream,
    })),
    osmHostelsHandledByOsm: osmNamedHostels.filter((p) => !p.provisional).map((p) => p.name),
  },
  additionsList: additions.map((a) => ({
    id: a.id,
    areaM2: a.areaM2,
    confidence: a.confidence,
    upstream: a.upstream,
    at: (() => {
      const c = centroid(a.ring.map((p) => project(p[0], p[1])));
      const l = ll(c);
      return `${l[1].toFixed(5)}, ${l[0].toFixed(5)}`;
    })(),
  })),
  roads: conn,
  green: {
    topoPolygons: greenSeen,
    over400m2: greenCov.length,
    coverageMin: +Math.min(...greenCov).toFixed(2),
    coverageMedian: +greenCov.sort((a, b) => a - b)[Math.floor(greenCov.length / 2)].toFixed(2),
    under70pct: greenCov.filter((c) => c < 0.7).length,
    added: greenOut.length,
    addedAreaM2: Math.round(
      greenOut.reduce((s, g) => s + area(g.ring.map((p) => project(p[0], p[1]))), 0),
    ),
  },
  trees: { placed: treeAcc.length, sizes: treeSizes },
  terrain: {
    cell: CELL,
    cols,
    rows,
    zRefElevation: terrain.zRefElevation,
    min: terrain.minElevation,
    max: terrain.maxElevation,
    rmsVsMeshM: +rms.toFixed(2),
    maxVsMeshM: +maxErr.toFixed(1),
    rmsVsContoursM: +ctrRms.toFixed(2),
    meshSamples: errs.length,
    contourSamples: ctrErrs.length,
  },
};
writeFileSync('docs/.topo-merge-stats.json', JSON.stringify(stats, null, 1));
console.log(
  JSON.stringify(
    {
      ...stats,
      additionsList: undefined,
      buildings: { ...stats.buildings, hostelLog: stats.buildings.hostelLog.length },
    },
    null,
    1,
  ),
);
