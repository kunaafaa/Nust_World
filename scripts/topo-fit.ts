/**
 * REFERENCE-ONLY. Georeferences reference/topoexport-* (local metres, no CRS) by fitting their building footprints to
 * ours (translation + small rotation search, IoU on a 1 m raster), then reports per-building offsets, heights and
 * contour/terrain statistics. Writes only to docs/. Nothing from the reference data is copied anywhere deployed.
 * Run: npx tsx scripts/topo-fit.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { buildCampus } from '../src/lib/campus';
import { pointInRing, unproject } from '../src/lib/geo';
import type { RawOsm } from '../src/lib/osm';
import type { Vec2 } from '../src/lib/types';
import { loadTopo } from './lib/topo';

const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const live = data.buildings.filter((b) => !b.offCampus);

// our raster at 1 m
let x0 = Infinity,
  z0 = Infinity,
  x1 = -Infinity,
  z1 = -Infinity;
for (const b of live)
  for (const [x, z] of b.footprint) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
x0 = Math.floor(x0 - 40);
z0 = Math.floor(z0 - 40);
x1 = Math.ceil(x1 + 40);
z1 = Math.ceil(z1 + 40);
const W = x1 - x0,
  H = z1 - z0;
const grid = new Int32Array(W * H).fill(-1);
live.forEach((b, i) => {
  const xs = b.footprint.map((p) => p[0]),
    zs = b.footprint.map((p) => p[1]);
  for (let gz = Math.floor(Math.min(...zs) - z0); gz <= Math.ceil(Math.max(...zs) - z0); gz++)
    for (let gx = Math.floor(Math.min(...xs) - x0); gx <= Math.ceil(Math.max(...xs) - x0); gx++)
      if (
        gx >= 0 &&
        gz >= 0 &&
        gx < W &&
        gz < H &&
        pointInRing([x0 + gx + 0.5, z0 + gz + 0.5], b.footprint)
      )
        grid[gz * W + gx] = i;
});
const at = (x: number, z: number) => {
  const gx = Math.floor(x - x0),
    gz = Math.floor(z - z0);
  return gx >= 0 && gz >= 0 && gx < W && gz < H ? grid[gz * W + gx] : -1;
};

const area = (r: Vec2[]) =>
  Math.abs(
    r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
const centroid = (r: Vec2[]): Vec2 => [
  r.reduce((s, p) => s + p[0], 0) / r.length,
  r.reduce((s, p) => s + p[1], 0) / r.length,
];

const out: Record<string, unknown> = {};
const md: string[] = [];
for (const [folder, name] of [
  ['reference/topoexport-9CF709', '9CF709'],
  ['reference/topoexport-18D98C', '18D98C'],
] as const) {
  const t = loadTopo(folder, name);
  // sample points: interiors of the larger topo buildings on a 3 m lattice (local x east, y north)
  const big = t.buildings.filter((b) => area(b.ring) > 150);
  const samples: Vec2[] = [];
  for (const b of big) {
    const xs = b.ring.map((p) => p[0]),
      ys = b.ring.map((p) => p[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 3)
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3)
        if (pointInRing([x, y], b.ring)) samples.push([x, y]);
  }
  const rot = (p: Vec2, a: number): Vec2 => [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a),
  ];
  const score = (ox: number, oz: number, a: number, step = 1) => {
    let h = 0,
      n = 0;
    for (let i = 0; i < samples.length; i += step) {
      const q = rot(samples[i], a);
      n++;
      if (at(ox + q[0], oz - q[1]) >= 0) h++;
    }
    return h / n;
  };
  let best = { ox: 0, oz: 0, a: 0, s: 0 };
  // coarse: 4 m steps over all positions, rotation 0 (north-up local frame assumed)
  for (let oz = z0 - 100; oz < z1 + 900; oz += 4)
    for (let ox = x0 - 100; ox < x1 + 100; ox += 4) {
      const s = score(ox, oz, 0, 6);
      if (s > best.s) best = { ox, oz, a: 0, s };
    }
  for (let da = -2; da <= 2; da += 0.25)
    for (let dz = -6; dz <= 6; dz += 1)
      for (let dx = -6; dx <= 6; dx += 1) {
        const a = (da * Math.PI) / 180;
        const s = score(best.ox + dx, best.oz + dz, a);
        if (s > best.s) best = { ox: best.ox + dx, oz: best.oz + dz, a, s };
      }
  const c0 = { ...best };
  for (let da = -0.25; da <= 0.25; da += 0.05)
    for (let dz = -1.5; dz <= 1.5; dz += 0.25)
      for (let dx = -1.5; dx <= 1.5; dx += 0.25) {
        const a = c0.a + (da * Math.PI) / 180;
        const s = score(c0.ox + dx, c0.oz + dz, a);
        if (s > best.s) best = { ox: c0.ox + dx, oz: c0.oz + dz, a, s };
      }
  const tr = (p: Vec2): Vec2 => {
    const q = rot(p, best.a);
    return [best.ox + q[0], best.oz - q[1]];
  };

  // per-building matching: topo building -> our building with greatest centroid-in-polygon / nearest overlap
  const rows: {
    topo: number;
    ours: string;
    name: string;
    off: number;
    bearing: number;
    dArea: number;
    hTopo?: number;
    hOurs: number;
    area: number;
  }[] = [];
  let unmatched = 0;
  t.buildings.forEach((b, i) => {
    const c = tr(centroid(b.ring));
    let hit = at(c[0], c[1]);
    if (hit < 0) {
      // vote by interior samples
      const votes = new Map<number, number>();
      const xs = b.ring.map((p) => p[0]),
        ys = b.ring.map((p) => p[1]);
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1.5)
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5)
          if (pointInRing([x, y], b.ring)) {
            const q = tr([x, y]);
            const k = at(q[0], q[1]);
            if (k >= 0) votes.set(k, (votes.get(k) || 0) + 1);
          }
      hit = [...votes.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? -1;
    }
    if (hit < 0) {
      unmatched++;
      return;
    }
    const o = live[hit],
      oc = centroid(o.footprint);
    const dx = c[0] - oc[0],
      dz = c[1] - oc[1];
    rows.push({
      topo: i,
      ours: o.id,
      name: o.name ?? 'unnamed',
      off: Math.hypot(dx, dz),
      bearing: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360,
      dArea: area(b.ring) / area(o.footprint),
      hTopo: b.height,
      hOurs: o.height,
      area: area(o.footprint),
    });
  });
  const ourUnmatched = live.filter(
    (o) =>
      !rows.some((r) => r.ours === o.id) &&
      (() => {
        const c = centroid(o.footprint);
        const lx = c[0] - best.ox,
          ly = -(c[1] - best.oz);
        return lx > 0 && ly > 0 && lx < t.extent[0] && ly < t.extent[1];
      })(),
  );
  const ll = (p: Vec2) => unproject(...tr(p));
  const sw = ll([0, 0]),
    ne = ll([t.extent[0], t.extent[1]]);
  const offs = rows.map((r) => r.off).sort((a, b) => a - b);
  const med = offs[Math.floor(offs.length / 2)];
  out[name] = {
    fit: best,
    extentLL: { sw, ne },
    matched: rows.length,
    unmatched,
    ourUnmatched: ourUnmatched.map((o) => o.id),
    rows,
    buildings: t.buildings.length,
    contours: t.contours.map((c) => ({ z: c.z, n: c.pts.length })),
    terrain: [Math.min(...t.terrain.map((v) => v[2])), Math.max(...t.terrain.map((v) => v[2]))],
  };
  const label = `${name}: ${(best.s * 100).toFixed(1)}% of topo building interior inside our footprints; rot ${((best.a * 180) / Math.PI).toFixed(2)}°; SW ${sw[1].toFixed(5)},${sw[0].toFixed(5)} NE ${ne[1].toFixed(5)},${ne[0].toFixed(5)}; matched ${rows.length}/${t.buildings.length}; median centroid offset ${med.toFixed(1)} m; >3 m: ${offs.filter((o) => o > 3).length}`;
  console.log(label);
  md.push(label);
}
writeFileSync('docs/.topo-fit.json', JSON.stringify(out, null, 1));
console.log('wrote docs/.topo-fit.json');
