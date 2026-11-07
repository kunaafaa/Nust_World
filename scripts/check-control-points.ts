/**
 * Compare your GPS-surveyed points with OSM. Skips politely when data/control-points.csv does not exist.
 * CSV header:  label,survey_lat,survey_lng,osm_id      (osm_id optional, e.g. way/209836754 or node/123)
 *  - with osm_id: error = distance from the survey point to the nearest vertex of that feature (use building corners / gates)
 *  - without:     error = distance to the nearest building corner or gate within 30 m
 * Writes docs/control-point-report.md with per-point error, mean/max, and the systematic east/north shift.
 * Run: npm run control-points
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dist, project, unproject } from '../src/lib/geo';
import { parseOsm, type RawOsm } from '../src/lib/osm';
import type { Vec2 } from '../src/lib/types';

const CSV = 'data/control-points.csv';
if (!existsSync(CSV)) {
  console.log(`No ${CSV}. Skipping (nothing to check). Add survey points to enable this report.`);
  process.exit(0);
}
const feats = parseOsm(JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm);
const verts = (f: (typeof feats)[number]): Vec2[] =>
  f.geom.kind === 'point' ? [f.geom.p] : f.geom.kind === 'line' ? f.geom.pts : f.geom.rings.flat();
const pool = feats.filter(
  (f) => f.tags.building || f.tags.barrier === 'gate' || /gate/i.test(f.tags.name ?? ''),
);

const rows = readFileSync(CSV, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(',').map((x) => x.trim()));
const res: { label: string; err: number; de: number; dn: number; ref: string }[] = [];
for (const [label, la, lo, osmId] of rows) {
  const p = project(parseFloat(lo), parseFloat(la));
  const cands = osmId ? feats.filter((f) => f.id === osmId) : pool;
  let best: { d: number; v: Vec2; ref: string } | null = null;
  for (const f of cands)
    for (const v of verts(f)) {
      const d = dist(p, v);
      if (!best || d < best.d) best = { d, v, ref: f.id };
    }
  if (!best || (!osmId && best.d > 30)) {
    res.push({ label, err: NaN, de: NaN, dn: NaN, ref: 'no match within 30 m' });
    continue;
  }
  res.push({ label, err: best.d, de: p[0] - best.v[0], dn: -(p[1] - best.v[1]), ref: best.ref });
}
const ok = res.filter((r) => !Number.isNaN(r.err));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const mDe = mean(ok.map((r) => r.de)),
  mDn = mean(ok.map((r) => r.dn));
const shift = Math.hypot(mDe, mDn);
const verdict =
  ok.length < 3
    ? 'Too few points to judge a systematic shift (need ≥ 3).'
    : shift > 3
      ? `**Systematic shift ${shift.toFixed(1)} m** (survey is ${mDe.toFixed(1)} m east, ${mDn.toFixed(1)} m north of OSM). To correct, set GLOBAL_OFFSET in src/lib/config.ts to { enabled: true, east: ${(-mDe).toFixed(1)}, north: ${(-mDn).toFixed(1)} }. It is OFF by default.`
      : `Mean shift ${shift.toFixed(1)} m is under the 3 m threshold: no correction recommended. (Phone GPS error under 5 m is noise.)`;
writeFileSync(
  'docs/control-point-report.md',
  `# Control point report

Generated ${new Date().toISOString().slice(0, 10)} · ${ok.length}/${res.length} points matched · mean error ${mean(ok.map((r) => r.err)).toFixed(2)} m · max ${Math.max(0, ...ok.map((r) => r.err)).toFixed(2)} m

${verdict}

| Point | Error (m) | East (m) | North (m) | Compared with |
|---|---|---|---|---|
${res.map((r) => `| ${r.label} | ${Number.isNaN(r.err) ? '—' : r.err.toFixed(2)} | ${Number.isNaN(r.de) ? '—' : r.de.toFixed(2)} | ${Number.isNaN(r.dn) ? '—' : r.dn.toFixed(2)} | ${r.ref} |`).join('\n')}
`,
);
void unproject;
console.log(verdict);
