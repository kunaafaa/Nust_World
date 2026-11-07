/**
 * REFERENCE-ONLY analysis. Tries to find where the toposection cross-section line runs on our map by matching the
 * building crossings recorded in the DXF against our footprints. Nothing from the toposection is copied into
 * /public, the geojson, landmarks.ts or heights.ts; this script only reads reference/toposection/toposection.dxf
 * as text and writes the result to docs/.
 *
 * Observed (DXF layer TPS_BUILDINGS, x = metres along the line): 345.1-350.7, 374.6-398.4, 503.2-506.8,
 * 515.7-524.7, 573.2-665.3, and nothing else along 998.4 m.
 *
 * Run: npx tsx scripts/toposection-locate.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { buildCampus } from '../src/lib/campus';
import { pointInRing, unproject } from '../src/lib/geo';
import type { RawOsm } from '../src/lib/osm';

const OBS: [number, number][] = [
  [345.13, 350.72],
  [374.6, 398.4],
  [503.2, 506.8],
  [515.7, 524.7],
  [573.2, 665.3],
];
const LEN = 998.4;

const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const rings = data.buildings.filter((b) => !b.offCampus).map((b) => b.footprint);

// Rasterise buildings at 1 m.
let x0 = Infinity,
  z0 = Infinity,
  x1 = -Infinity,
  z1 = -Infinity;
for (const r of rings)
  for (const [x, z] of r) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
x0 = Math.floor(x0 - 60);
z0 = Math.floor(z0 - 60);
x1 = Math.ceil(x1 + 60);
z1 = Math.ceil(z1 + 60);
const W = x1 - x0,
  H = z1 - z0;
const grid = new Uint8Array(W * H);
for (const r of rings) {
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
  for (let gz = Math.floor(b - z0); gz <= Math.ceil(d - z0); gz++)
    for (let gx = Math.floor(a - x0); gx <= Math.ceil(c - x0); gx++)
      if (gx >= 0 && gz >= 0 && gx < W && gz < H && pointInRing([x0 + gx + 0.5, z0 + gz + 0.5], r))
        grid[gz * W + gx] = 1;
}
const at = (x: number, z: number) => {
  const gx = Math.floor(x - x0),
    gz = Math.floor(z - z0);
  return gx >= 0 && gz >= 0 && gx < W && gz < H ? grid[gz * W + gx] : 0;
};

// Observed mask at 1 m.
const N = Math.floor(LEN);
const obs = new Uint8Array(N);
for (const [a, b] of OBS) for (let t = Math.ceil(a); t <= Math.floor(b) && t < N; t++) obs[t] = 1;
const obsTotal = obs.reduce((s, v) => s + v, 0);
// Probe points: centres of the observed intervals, widest first, for early rejection.
const probes = OBS.map(([a, b]) => ({ t: (a + b) / 2, w: b - a })).sort((p, q) => q.w - p.w);

type Hit = { iou: number; x: number; z: number; ang: number; tp: number; fp: number };
const best: Hit[] = [];
const STEP = 3;
for (let a10 = 0; a10 < 3600; a10 += 5) {
  const ang = (a10 / 10) * (Math.PI / 180);
  const dx = Math.cos(ang),
    dz = Math.sin(ang);
  for (let sz = z0; sz < z1; sz += STEP)
    for (let sx = x0; sx < x1; sx += STEP) {
      // early rejection on the widest crossings
      if (!at(sx + dx * probes[0].t, sz + dz * probes[0].t)) continue;
      if (!at(sx + dx * probes[1].t, sz + dz * probes[1].t)) continue;
      if (!at(sx + dx * probes[2].t, sz + dz * probes[2].t)) continue;
      let tp = 0,
        fp = 0;
      for (let t = 0; t < N; t++) {
        const p = at(sx + dx * t, sz + dz * t);
        if (p) {
          if (obs[t]) tp++;
          else fp++;
        }
      }
      const iou = tp / (obsTotal + fp);
      if (iou > 0.5) best.push({ iou, x: sx, z: sz, ang: a10 / 10, tp, fp });
    }
}
best.sort((p, q) => q.iou - p.iou);
// de-duplicate near-identical solutions
const uniq: Hit[] = [];
for (const h of best)
  if (!uniq.some((u) => Math.hypot(u.x - h.x, u.z - h.z) < 25 && Math.abs(u.ang - h.ang) < 3))
    uniq.push(h);

mkdirSync('docs', { recursive: true });
const rows = uniq.slice(0, 8).map((h) => {
  const [lng, lat] = unproject(h.x, h.z);
  const [lng2, lat2] = unproject(
    h.x + Math.cos((h.ang * Math.PI) / 180) * LEN,
    h.z + Math.sin((h.ang * Math.PI) / 180) * LEN,
  );
  return `| ${h.iou.toFixed(3)} | ${h.tp}/${obsTotal} | ${h.fp} | ${h.ang.toFixed(1)}° | ${lat.toFixed(5)}, ${lng.toFixed(5)} | ${lat2.toFixed(5)}, ${lng2.toFixed(5)} |`;
});
writeFileSync('scripts/.toposection-candidates.json', JSON.stringify(uniq.slice(0, 20), null, 1));
console.log('candidates with IoU > 0.5:', best.length, 'unique:', uniq.length);
console.log(
  '| IoU | observed building metres matched | extra building metres | scene angle | start lat,lng | end lat,lng |',
);
console.log(rows.join('\n'));
