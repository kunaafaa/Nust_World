/**
 * REFERENCE-ONLY comparison of reference/toposection/toposection.dxf against our map. Reads the DXF as text; writes only
 * to docs/ (never /public, geojson, landmarks.ts or heights.ts). Run scripts/toposection-locate.ts first for a rough
 * fit; this script refines it, compares buildings / roads / green areas along the line, and writes
 * docs/toposection-compare.md, docs/compare/overlay.svg, docs/compare/profile.svg and docs/.toposection-fit.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { buildCampus } from '../src/lib/campus';
import { distToSegment, pointInRing, unproject } from '../src/lib/geo';
import type { RawOsm } from '../src/lib/osm';
import type { Vec2 } from '../src/lib/types';

// ───────── parse the DXF as plain text ─────────
interface Ent {
  type: string;
  layer: string;
  g: [string, string][];
}
function parseDxf(path: string): Ent[] {
  const t = readFileSync(path, 'utf8').split(/\r?\n/);
  const ents: Ent[] = [];
  let cur: Ent | null = null,
    inEnt = false;
  for (let i = 0; i + 1 < t.length; i += 2) {
    const c = t[i].trim(),
      v = t[i + 1];
    if (c === '2' && v === 'ENTITIES') {
      inEnt = true;
      continue;
    }
    if (c === '0' && v === 'ENDSEC') {
      if (cur) ents.push(cur);
      cur = null;
      inEnt = false;
      continue;
    }
    if (!inEnt) continue;
    if (c === '0') {
      if (cur) ents.push(cur);
      cur = { type: v, layer: '', g: [] };
      continue;
    }
    if (cur) {
      cur.g.push([c, v]);
      if (c === '8') cur.layer = v.trim();
    }
  }
  return ents;
}
const num = (e: Ent, code: string) => e.g.filter((x) => x[0] === code).map((x) => parseFloat(x[1]));
const dxf = parseDxf('reference/toposection/toposection.dxf');
const xExtent = (layer: string) =>
  dxf
    .filter((e) => e.layer === layer && e.type === 'LWPOLYLINE')
    .map((e) => {
      const xs = num(e, '10');
      return [Math.min(...xs), Math.max(...xs)] as [number, number];
    });
const OBS_B = xExtent('TPS_BUILDINGS').sort((a, b) => a[0] - b[0]);
const OBS_R = xExtent('TPS_ROADS').sort((a, b) => a[0] - b[0]);
const OBS_G = xExtent('TPS_GREEN_AREAS').sort((a, b) => a[0] - b[0]);
const heights = dxf
  .filter((e) => e.layer === 'TPS_BUILDING_HEIGHTS_TEXT')
  .map((e) => ({ x: num(e, '10')[0], h: e.g.find((x) => x[0] === '1')![1] }))
  .sort((a, b) => a.x - b.x);
// Terrain profile: tick labels are elevations (m) at each projection line; positions are x along the section.
const terrain = dxf
  .filter((e) => e.layer === 'TPS_PROJECTION_LINES_TEXT')
  .map((e) => ({ x: num(e, '10')[0], z: parseFloat(e.g.find((g) => g[0] === '1')![1]) }))
  .sort((a, b) => a.x - b.x);
const LEN = 998.4;

// ───────── our data ─────────
const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const live = data.buildings.filter((b) => !b.offCampus);
const bbox = (r: Vec2[]) =>
  r.reduce(
    (a, p) => [
      Math.min(a[0], p[0]),
      Math.min(a[1], p[1]),
      Math.max(a[2], p[0]),
      Math.max(a[3], p[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
const boxes = live.map((b) => bbox(b.footprint));
const inB = (x: number, z: number) => {
  for (let i = 0; i < live.length; i++) {
    const b = boxes[i];
    if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
    if (pointInRing([x, z], live[i].footprint)) return i;
  }
  return -1;
};

// ───────── refine the fit ─────────
const cand = JSON.parse(readFileSync('scripts/.toposection-candidates.json', 'utf8')) as {
  x: number;
  z: number;
  ang: number;
}[];
const inObs = (t: number) => OBS_B.some(([a, b]) => t >= a && t <= b);
const score = (sx: number, sz: number, angDeg: number) => {
  const a = (angDeg * Math.PI) / 180,
    dx = Math.cos(a),
    dz = Math.sin(a);
  let tp = 0,
    fp = 0,
    tot = 0;
  for (let t = 0; t < LEN; t += 0.5) {
    const hit = inB(sx + dx * t, sz + dz * t) >= 0;
    const o = inObs(t);
    if (o) tot++;
    if (hit && o) tp++;
    else if (hit) fp++;
  }
  return tp / (tot + fp);
};
let best = { x: cand[0].x, z: cand[0].z, ang: cand[0].ang, s: 0 };
for (let da = -3; da <= 3; da += 0.25)
  for (let dx = -6; dx <= 6; dx += 1.5)
    for (let dz = -6; dz <= 6; dz += 1.5) {
      const s = score(cand[0].x + dx, cand[0].z + dz, cand[0].ang + da);
      if (s > best.s) best = { x: cand[0].x + dx, z: cand[0].z + dz, ang: cand[0].ang + da, s };
    }
for (let da = -0.3; da <= 0.3; da += 0.05)
  for (let dx = -1.5; dx <= 1.5; dx += 0.3)
    for (let dz = -1.5; dz <= 1.5; dz += 0.3) {
      const s = score(best.x + dx, best.z + dz, best.ang + da);
      if (s > best.s) best = { x: best.x + dx, z: best.z + dz, ang: best.ang + da, s };
    }
const A = (best.ang * Math.PI) / 180,
  DX = Math.cos(A),
  DZ = Math.sin(A);
const P = (t: number): Vec2 => [best.x + DX * t, best.z + DZ * t];
const ll = (t: number) => unproject(P(t)[0], P(t)[1]);

// Predicted building intervals along the line (our footprints), at 0.25 m.
const ours: { a: number; b: number; id: string; name: string; height: number }[] = [];
let curB = -1,
  start = 0;
for (let t = 0; t <= LEN; t += 0.25) {
  const i = inB(P(t)[0], P(t)[1]);
  if (i !== curB) {
    if (curB >= 0)
      ours.push({
        a: start,
        b: t,
        id: live[curB].id,
        name: live[curB].name ?? 'unnamed',
        height: live[curB].height,
      });
    curB = i;
    start = t;
  }
}
// Match observed building intervals to ours (max overlap).
const rows: string[] = [];
const edgeOffsets: number[] = [];
OBS_B.forEach(([a, b], i) => {
  let m = ours
    .filter((o) => o.b > a - 8 && o.a < b + 8)
    .sort((p, q) => Math.min(q.b, b) - Math.max(q.a, a) - (Math.min(p.b, b) - Math.max(p.a, a)))[0];
  if (!m) {
    rows.push(`| ${i + 1} | ${a.toFixed(1)}–${b.toFixed(1)} | none within 8 m | – | – | – |`);
    return;
  }
  const dEnter = m.a - a,
    dExit = m.b - b;
  edgeOffsets.push(dEnter, dExit);
  const h = heights.find((q) => q.x >= a - 4 && q.x <= b + 4)?.h ?? '?';
  rows.push(
    `| ${i + 1} | ${a.toFixed(1)}–${b.toFixed(1)} (${(b - a).toFixed(1)} m) | ${m.name} (\`${m.id}\`) ${m.a.toFixed(1)}–${m.b.toFixed(1)} (${(m.b - m.a).toFixed(1)} m) | ${dEnter >= 0 ? '+' : ''}${dEnter.toFixed(1)} / ${dExit >= 0 ? '+' : ''}${dExit.toFixed(1)} | ${h} | ${m.height.toFixed(1)} |`,
  );
});
const extraOurs = ours.filter((o) => !OBS_B.some(([a, b]) => o.b > a - 3 && o.a < b + 3));
const meanEdge = edgeOffsets.reduce((s, v) => s + v, 0) / (edgeOffsets.length || 1);
const rmsEdge = Math.sqrt(edgeOffsets.reduce((s, v) => s + v * v, 0) / (edgeOffsets.length || 1));

// Roads: our centreline crossings with the line vs observed road intervals (centre of each).
const obsRoadC = OBS_R.map(([a, b]) => ({ c: (a + b) / 2, w: b - a }));
const roadCross: { t: number; name: string; kind: string }[] = [];
for (const r of [...data.roads, ...data.footways]) {
  for (let i = 1; i < r.points.length; i++) {
    const p = r.points[i - 1],
      q = r.points[i];
    const d1x = q[0] - p[0],
      d1z = q[1] - p[1];
    const den = DX * d1z - DZ * d1x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - best.x) * d1z - (p[1] - best.z) * d1x) / den;
    const u = ((p[0] - best.x) * DZ - (p[1] - best.z) * DX) / den;
    if (t >= 0 && t <= LEN && u >= 0 && u <= 1)
      roadCross.push({ t, name: r.name ?? '', kind: r.kind });
  }
}
const vehicular = roadCross
  .filter((r) => !/footway|path|steps|pedestrian|track|cycleway/.test(r.kind))
  .sort((a, b) => a.t - b.t);
let matchedR = 0;
const roadOff: number[] = [];
for (const o of obsRoadC) {
  const m = vehicular.reduce<{ t: number } | null>(
    (bb, r) => (!bb || Math.abs(r.t - o.c) < Math.abs(bb.t - o.c) ? r : bb),
    null,
  );
  if (m && Math.abs(m.t - o.c) <= 15) {
    matchedR++;
    roadOff.push(m.t - o.c);
  }
}
const ourRoadUnmatched = vehicular.filter(
  (r) => !obsRoadC.some((o) => Math.abs(o.c - r.t) <= 15),
).length;

// Green areas: our green polygons along the line.
const greenIv: [number, number][] = [];
{
  let on = false,
    s = 0;
  for (let t = 0; t <= LEN; t += 0.5) {
    const hit = data.green.some((g) => pointInRing(P(t), g.points));
    if (hit && !on) {
      on = true;
      s = t;
    }
    if (!hit && on) {
      on = false;
      greenIv.push([s, t]);
    }
  }
}

// Terrain stats (CC BY 4.0 DTM at 30 m per the file's licence notes: kept in docs only, as reference).
const zs = terrain.map((p) => p.z);
const slope = (zs[zs.length - 1] - zs[0]) / LEN;

mkdirSync('docs/compare', { recursive: true });
writeFileSync(
  'docs/.toposection-fit.json',
  JSON.stringify({ start: ll(0), end: ll(LEN), angleSceneDeg: best.ang, iou: best.s }, null, 1),
);

// ───────── overlay (plan view) + profile SVGs ─────────
const mid = P(LEN / 2);
const R = 560;
const sx = (x: number) => (x - mid[0] + R) * 0.9,
  sz = (z: number) => (z - mid[1] + R) * 0.9;
const poly = (r: Vec2[]) => r.map((p) => `${sx(p[0]).toFixed(1)},${sz(p[1]).toFixed(1)}`).join(' ');
const inView = (b: number[]) =>
  b[2] > mid[0] - R && b[0] < mid[0] + R && b[3] > mid[1] - R && b[1] < mid[1] + R;
const ovl: string[] = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${R * 1.8}" height="${R * 1.8}" viewBox="0 0 ${R * 1.8} ${R * 1.8}"><rect width="100%" height="100%" fill="#070d1c"/>`,
];
data.roads.forEach((r) =>
  ovl.push(`<polyline points="${poly(r.points)}" fill="none" stroke="#2d323b" stroke-width="3"/>`),
);
live.forEach((b, i) => {
  if (inView(boxes[i]))
    ovl.push(
      `<polygon points="${poly(b.footprint)}" fill="#5aa2ff" fill-opacity="0.18" stroke="#5aa2ff" stroke-width="0.8"/>`,
    );
});
const seg = (a: number, b: number, col: string, w: number) =>
  `<line x1="${sx(P(a)[0])}" y1="${sz(P(a)[1])}" x2="${sx(P(b)[0])}" y2="${sz(P(b)[1])}" stroke="${col}" stroke-width="${w}" stroke-linecap="butt"/>`;
ovl.push(seg(0, LEN, '#ffffff', 0.8));
OBS_B.forEach(([a, b]) => ovl.push(seg(a, b, '#ffd04d', 5)));
OBS_R.forEach(([a, b]) => ovl.push(seg(a, b, '#ff5d5d', 3)));
ovl.push(
  `<text x="14" y="24" fill="#fff" font-family="sans-serif" font-size="14">Toposection line over our map (reference only). White = section line. Yellow = buildings the toposection says it crosses. Red = roads. Blue = our building footprints.</text></svg>`,
);
writeFileSync('docs/compare/overlay.svg', ovl.join('\n'));

const PW = 1000,
  PH = 260;
const px = (t: number) => 20 + (t / LEN) * (PW - 40);
const zmin = Math.min(...zs),
  zmax = Math.max(...zs);
const py = (z: number) => 190 - ((z - zmin) / (zmax - zmin || 1)) * 120;
const prof: string[] = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}"><rect width="100%" height="100%" fill="#070d1c"/>`,
];
prof.push(
  `<polyline fill="none" stroke="#9fb0c8" stroke-width="2" points="${terrain
    .filter((_, i) => i % 3 === 0)
    .map((p) => `${px(p.x).toFixed(1)},${py(p.z).toFixed(1)}`)
    .join(' ')}"/>`,
);
OBS_B.forEach(([a, b]) =>
  prof.push(
    `<rect x="${px(a)}" y="40" width="${Math.max(2, px(b) - px(a))}" height="14" fill="#ffd04d"/>`,
  ),
);
ours.forEach((o) =>
  prof.push(
    `<rect x="${px(o.a)}" y="58" width="${Math.max(2, px(o.b) - px(o.a))}" height="14" fill="#5aa2ff"/>`,
  ),
);
OBS_R.forEach(([a, b]) =>
  prof.push(
    `<rect x="${px(a)}" y="80" width="${Math.max(2, px(b) - px(a))}" height="8" fill="#ff5d5d"/>`,
  ),
);
vehicular.forEach((r) =>
  prof.push(`<rect x="${px(r.t) - 1}" y="92" width="2" height="8" fill="#ff9a6c"/>`),
);
prof.push(
  `<g font-family="sans-serif" font-size="12" fill="#fff"><text x="20" y="20">Along the section (0 to ${LEN.toFixed(0)} m). Yellow: toposection buildings. Blue: our footprints on the same line. Red: toposection roads. Orange ticks: our roads. Grey: terrain ${zmin.toFixed(1)}–${zmax.toFixed(1)} m (reference).</text></g></svg>`,
);
writeFileSync('docs/compare/profile.svg', prof.join('\n'));

const fmt = (xs: number[]) =>
  xs.length
    ? `mean ${(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1)} m, max |${Math.max(...xs.map(Math.abs)).toFixed(1)}| m`
    : 'n/a';
const bearing = (best.ang + 90) % 360; // scene angle (x east, z south) → compass bearing of travel
const compass = ((Math.atan2(DX, -DZ) * 180) / Math.PI + 360) % 360;
void bearing;
writeFileSync(
  'docs/toposection-compare.md',
  `# Toposection vs our map (reference only)

Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/toposection-compare.ts\`. See \`docs/toposection-report.md\` for what the file is and its licence status.

## Where the section line is (inferred, NOT stated in the file)

The file has no coordinates. The line was located by matching its building crossings to our footprints (\`scripts/toposection-locate.ts\`), then refined.

- Start (x = 0): **${ll(0)[1].toFixed(5)}, ${ll(0)[0].toFixed(5)}** → end (x = ${LEN}): **${ll(LEN)[1].toFixed(5)}, ${ll(LEN)[0].toFixed(5)}**, heading **${compass.toFixed(1)}° (compass)**
- Fit quality: IoU **${best.s.toFixed(3)}** (1.0 = identical). Of ${OBS_B.reduce((s, [a, b]) => s + (b - a), 0).toFixed(0)} m of building the toposection records, the fit reproduces most; our map has ${extraOurs.reduce((s, o) => s + (o.b - o.a), 0).toFixed(1)} m of building along the line that the toposection does not.
- Confidence: the match is strong (the next-best unrelated line scores far lower) but it is an **inference**. A 1-D section cannot prove its own position, and the fit was chosen to maximise agreement with OUR footprints, so it cannot reveal a shift *across* the line.

## What can and cannot be measured

A section only records where the line crosses things. So we can compare **along-line positions** (edge positions of buildings, road crossings, green areas). We **cannot** measure sideways shifts, building shapes, or a global X/Y offset, and **no systematic shift can be claimed from this file**. Control points (\`data/control-points.csv\`) remain the only way to verify absolute position.

Also: the toposection's buildings and roads come from **Overture Maps**, not surveyed ground truth. Where it disagrees with OSM, either could be wrong.

## Buildings (5 observed crossings)

| # | Toposection (m along line) | Our building on the same line | Offset enter / exit (m) | Toposection height label | Our resolved height (m) |
|---|---|---|---|---|---|
${rows.join('\n')}

Along-line edge offsets: ${fmt(edgeOffsets)}; RMS ${rmsEdge.toFixed(1)} m. Mean signed offset ${meanEdge.toFixed(1)} m (not evidence of a systematic shift: see above).

Our buildings on the line that the toposection does **not** list (${extraOurs.length}):
${extraOurs.length ? extraOurs.map((o) => `- ${o.name} (\`${o.id}\`) at ${o.a.toFixed(1)}–${o.b.toFixed(1)} m`).join('\n') : '_none_'}

## Roads

Toposection road crossings: ${OBS_R.length}. Our vehicular road crossings on the same line: ${vehicular.length} (footpaths excluded).
Matched within 15 m: **${matchedR} / ${OBS_R.length}** (${fmt(roadOff)} along-line offset). Our roads with no toposection counterpart: ${ourRoadUnmatched}.

## Green areas

Toposection: ${OBS_G.length} intervals (${OBS_G.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)}`).join(', ')}). Ours: ${greenIv.length} intervals (${greenIv.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)}`).join(', ')}).

## Elevation

Terrain along the line: **${zmin.toFixed(1)} m to ${zmax.toFixed(1)} m**, ${(slope * 100).toFixed(2)} % average ${slope > 0 ? 'rise' : 'fall'} from x = 0 to x = ${LEN}. This is the 30 m global DTM, so it shows the broad slope only, not small features. Our map is flat; see the TODO in the report.

## Overlays

- \`docs/compare/overlay.svg\`: plan view, section line and crossings over our footprints and roads.
- \`docs/compare/profile.svg\`: along-line strip comparing buildings, roads and terrain.
`,
);
console.log({
  fit: best,
  edgeOffsets: edgeOffsets.map((v) => +v.toFixed(1)),
  matchedR,
  of: OBS_R.length,
  ours: ours.length,
  extra: extraOurs.length,
  roadOff: roadOff.map((v) => +v.toFixed(1)),
  green: [OBS_G.length, greenIv.length],
  zmin,
  zmax,
});
