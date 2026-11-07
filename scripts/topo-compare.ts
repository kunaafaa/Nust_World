/**
 * REFERENCE-ONLY comparison of reference/topoexport-* against our map. Needs docs/.topo-fit.json from topo-fit.ts.
 * Writes docs/topo-compare.md and docs/compare/topo-*.svg. Nothing here is deployed or fed back into the app data.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { HEIGHTS } from '../src/data/heights';
import { buildCampus } from '../src/lib/campus';
import { pointInRing, unproject } from '../src/lib/geo';
import type { RawOsm } from '../src/lib/osm';
import type { Vec2 } from '../src/lib/types';
import { loadTopo } from './lib/topo';

type Fit = { ox: number; oz: number; a: number; s: number };
const fits = JSON.parse(readFileSync('docs/.topo-fit.json', 'utf8')) as Record<
  string,
  {
    fit: Fit;
    rows: {
      topo: number;
      ours: string;
      name: string;
      off: number;
      bearing: number;
      dArea: number;
      hTopo?: number;
      hOurs: number;
      area: number;
    }[];
    ourUnmatched: string[];
    extentLL: { sw: Vec2; ne: Vec2 };
  }
>;
const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const live = data.buildings.filter((b) => !b.offCampus);
const byId = new Map(live.map((b) => [b.id, b]));
const cen = (r: Vec2[]): Vec2 => [
  r.reduce((s, p) => s + p[0], 0) / r.length,
  r.reduce((s, p) => s + p[1], 0) / r.length,
];
const area = (r: Vec2[]) =>
  Math.abs(
    r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
const ll = (p: Vec2) => unproject(p[0], p[1]);
const hKnown = new Set(HEIGHTS.map((h) => 'way/' + h.osmId));
const comp = (deg: number) =>
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

const md: string[] = [
  `# Topo data vs our map (reference only)

Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/topo-fit.ts\` + \`scripts/topo-compare.ts\`. Dataset descriptions and licence status: \`docs/topo-data-report.md\`. **All three datasets are reference only**; nothing here feeds the app.
`,
];
const scenes: Record<string, { tr: (p: Vec2) => Vec2; topo: ReturnType<typeof loadTopo> }> = {};

for (const name of ['9CF709', '18D98C']) {
  const f = fits[name];
  const topo = loadTopo(`reference/topoexport-${name}`, name);
  const tr = (p: Vec2): Vec2 => {
    const c = Math.cos(f.fit.a),
      s = Math.sin(f.fit.a);
    return [f.fit.ox + p[0] * c - p[1] * s, f.fit.oz - (p[0] * s + p[1] * c)];
  };
  scenes[name] = { tr, topo };
  const deg = (f.fit.a * 180) / Math.PI;
  const shiftRows = f.rows.filter((r) => r.dArea > 0.8 && r.dArea < 1.25);
  const ang = (r: { off: number; bearing: number }) => (r.bearing * Math.PI) / 180;
  const mE = shiftRows.reduce((s, r) => s + r.off * Math.sin(ang(r)), 0) / (shiftRows.length || 1);
  const mN = shiftRows.reduce((s, r) => s + r.off * Math.cos(ang(r)), 0) / (shiftRows.length || 1);
  const sdE = Math.sqrt(
    shiftRows.reduce((s, r) => s + (r.off * Math.sin(ang(r)) - mE) ** 2, 0) /
      (shiftRows.length || 1),
  );
  const sdN = Math.sqrt(
    shiftRows.reduce((s, r) => s + (r.off * Math.cos(ang(r)) - mN) ** 2, 0) /
      (shiftRows.length || 1),
  );
  const offs = shiftRows.map((r) => r.off).sort((a, b) => a - b);
  const bad = f.rows
    .filter((r) => r.off > 3 && r.dArea > 0.8 && r.dArea < 1.25)
    .sort((a, b) => b.off - a.off);
  const shape = f.rows.filter((r) => r.off > 3 && !(r.dArea > 0.8 && r.dArea < 1.25));

  md.push(`## topoexport-${name}

### Georeference
- No CRS in the file (DXF local metres, origin at the south-west corner of the export frame, \`$INSUNITS\` 6 = metres). **Fitted** to our footprints by maximising overlap (the fit is chosen against OUR data, so it can show shape and relative agreement but cannot prove absolute position; for that we need \`data/control-points.csv\`).
- Frame size ${topo.extent[0].toFixed(0)} × ${topo.extent[1].toFixed(0)} m. Fitted SW corner **${f.extentLL.sw[1].toFixed(5)}, ${f.extentLL.sw[0].toFixed(5)}**, NE corner **${f.extentLL.ne[1].toFixed(5)}, ${f.extentLL.ne[0].toFixed(5)}**.
- Fitted rotation **${deg.toFixed(2)}°** relative to our tangent plane. This is almost exactly the UTM zone 43 grid convergence at 72.99°E, (72.99−75)×sin 33.64° ≈ −1.1°, so the export is in a **north-up UTM grid** and the rotation is a frame difference, not a map error. Our scene is aligned to true north.
- Fit quality: **${(f.fit.s * 100).toFixed(1)}%** of the topo building interior (buildings over 150 m²) lies inside one of our footprints.
- Matched ${f.rows.length} of ${topo.buildings.length} topo buildings to one of ours by centroid/vote.

### Positions (matched buildings with similar area, ratio 0.8–1.25: ${shiftRows.length})
- Centroid offset: median **${offs[Math.floor(offs.length / 2)]?.toFixed(1)} m**, 90th percentile ${offs[Math.floor(offs.length * 0.9)]?.toFixed(1)} m.
- Mean shift vector topo − ours: **${mE.toFixed(2)} m east, ${mN.toFixed(2)} m north** (scatter ±${sdE.toFixed(1)} / ±${sdN.toFixed(1)} m). ${Math.hypot(mE, mN) < Math.max(sdE, sdN) * 0.5 ? 'The mean is well inside the scatter: **no systematic shift detected.**' : 'The mean is large compared with the scatter: **possible systematic shift**; but the fit was tuned to our data, so treat this as a fit residual, not evidence.'}

### Discrepancies over 3 m, same-size buildings (${bad.length})
| Feature | Our id | Our centroid | Topo centroid | Offset | Bearing (our→topo) | Area ratio |
|---|---|---|---|---|---|---|
${
  bad
    .slice(0, 40)
    .map((r) => {
      const o = byId.get(r.ours)!,
        oc = cen(o.footprint);
      const tb = topo.buildings[r.topo],
        tc = tr(cen(tb.ring));
      return `| ${r.name} | \`${r.ours}\` | ${ll(oc)[1].toFixed(5)}, ${ll(oc)[0].toFixed(5)} | ${ll(tc)[1].toFixed(5)}, ${ll(tc)[0].toFixed(5)} | ${r.off.toFixed(1)} m | ${r.bearing.toFixed(0)}° ${comp(r.bearing)} | ${r.dArea.toFixed(2)} |`;
    })
    .join('\n') || '| none | | | | | | |'
}
${bad.length > 40 ? `\n…and ${bad.length - 40} more (see \`docs/.topo-fit.json\`).` : ''}

Another ${shape.length} matched buildings differ by over 3 m at the centroid but have a different footprint area (ratio outside 0.8–1.25): shape or merge/split differences, not positional errors. Largest: ${
    shape
      .sort((a, b) => b.off - a.off)
      .slice(0, 6)
      .map((r) => `${r.name} (${r.off.toFixed(0)} m, area ×${r.dArea.toFixed(2)})`)
      .join('; ') || 'none'
  }.

### Buildings in one map but not the other
- **In topo, nothing of ours there:** ${(() => {
    const missing = topo.buildings
      .map((b, i) => ({ b, i, c: tr(cen(b.ring)), a: area(b.ring) }))
      .filter((q) => !f.rows.some((r) => r.topo === q.i) && q.a > 60)
      .sort((p, q) => q.a - p.a);
    return `${missing.length} over 60 m². Largest: ${missing
      .slice(0, 8)
      .map((q) => `${ll(q.c)[1].toFixed(5)}, ${ll(q.c)[0].toFixed(5)} (${q.a.toFixed(0)} m²)`)
      .join('; ')}`;
  })()}
- **In ours, nothing in topo (inside its frame):** ${f.ourUnmatched.length}. ${f.ourUnmatched
    .slice(0, 10)
    .map((id) => `${byId.get(id)?.name ?? id}`)
    .join(', ')}${f.ourUnmatched.length > 10 ? '…' : ''}

### Building heights (topo label vs our resolved height)
`);
  const hm = f.rows.filter((r) => r.hTopo !== undefined);
  const dist: Record<string, number> = {};
  hm.forEach((r) => (dist[r.hTopo!] = (dist[r.hTopo!] || 0) + 1));
  const nonDefault = hm.filter((r) => r.hTopo !== 6);
  md.push(`- Label distribution over all ${topo.buildings.length} topo buildings: ${Object.entries(
    (() => {
      const d: Record<string, number> = {};
      topo.buildings.forEach((b) => (d[b.height ?? '?'] = (d[b.height ?? '?'] || 0) + 1));
      return d;
    })(),
  )
    .map(([k, v]) => `${k} m ×${v}`)
    .join(
      ', ',
    )}. **${Math.round((topo.buildings.filter((b) => b.height === 6).length / topo.buildings.length) * 100)}% are exactly 6.0 m**, which is a default fill (Overture records no height for most buildings), not a measurement.
- Matched buildings whose topo height is not the 6.0 default: ${nonDefault.length}.
${nonDefault.length ? `\n| Building | Topo height | Our height | Our source |\n|---|---|---|---|\n${nonDefault.map((r) => `| ${r.name} (\`${r.ours}\`) | ${r.hTopo} m | ${r.hOurs.toFixed(1)} m | ${hKnown.has(r.ours) ? 'heights.ts' : 'landmarks / OSM / default'} |`).join('\n')}\n` : ''}`);

  // elevation
  const zs = topo.terrain.map((v) => v[2]);
  md.push(`### Elevation
- Terrain mesh: ${topo.terrain.length} vertices, **${Math.min(...zs).toFixed(1)}–${Math.max(...zs).toFixed(1)} m**. Contours: ${topo.contours.length} polylines at 5 m intervals (${[...new Set(topo.contours.map((c) => c.z))].sort().join(', ')} m).
- Source (per LICENSE.txt): OpenGeoHub EDTM, **30 m** cells, CC BY 4.0. A 30 m model cannot resolve single buildings or small mounds; it shows the broad fall across the campus only.
`);
}

// A vs B consistency
const A = scenes['9CF709'],
  B = scenes['18D98C'];
const pairs: { d: number; dh: number | undefined; id: string }[] = [];
const bc = B.topo.buildings.map((b) => ({ c: B.tr(cen(b.ring)), a: area(b.ring), h: b.height }));
A.topo.buildings.forEach((b) => {
  const c = A.tr(cen(b.ring)),
    a = area(b.ring);
  let best: (typeof bc)[number] | undefined,
    bd = 1e9;
  for (const q of bc) {
    const d = Math.hypot(q.c[0] - c[0], q.c[1] - c[1]);
    if (d < bd && q.a > a * 0.7 && q.a < a * 1.4) {
      bd = d;
      best = q;
    }
  }
  if (best && bd < 15)
    pairs.push({
      d: bd,
      dh: b.height !== undefined && best.h !== undefined ? b.height - best.h : undefined,
      id: '',
    });
});
const ds = pairs.map((p) => p.d).sort((a, b) => a - b);
const hdiff = pairs.filter((p) => p.dh !== undefined && p.dh !== 0).length;
// terrain agreement: nearest B vertex for A vertices
let zsum = 0,
  zn = 0,
  zmax = 0;
const Bt = B.topo.terrain.map((v) => ({ p: B.tr([v[0], v[1]]), z: v[2] }));
for (let i = 0; i < A.topo.terrain.length; i += 3) {
  const v = A.topo.terrain[i],
    p = A.tr([v[0], v[1]]);
  let bz = NaN,
    bd = 25;
  for (const q of Bt) {
    const d = Math.hypot(q.p[0] - p[0], q.p[1] - p[1]);
    if (d < bd) {
      bd = d;
      bz = q.z;
    }
  }
  if (!Number.isNaN(bz)) {
    const e = v[2] - bz;
    zsum += e;
    zn++;
    zmax = Math.max(zmax, Math.abs(e));
  }
}
md.push(`## The two exports against each other

- Overlap: both frames sit over the same campus; B (${B.topo.extent[0].toFixed(0)} × ${B.topo.extent[1].toFixed(0)} m) is larger than A (${A.topo.extent[0].toFixed(0)} × ${A.topo.extent[1].toFixed(0)} m) and extends further north and east. Same source stack (Overture + EDTM + canopy), so they are **complementary views of the same data, not independent confirmation**.
- Buildings paired by position and size: ${pairs.length}; centroid separation median **${ds[Math.floor(ds.length / 2)]?.toFixed(2)} m**, max ${ds[ds.length - 1]?.toFixed(1)} m (both fitted separately to our map, so this also measures the fit repeatability).
- Height labels that differ between the two for the same building: ${hdiff} of ${pairs.filter((p) => p.dh !== undefined).length}.
- Terrain at shared locations (A − B, ${zn} samples): mean ${(zsum / (zn || 1)).toFixed(2)} m, worst ${zmax.toFixed(1)} m.
- Note the two exports are in **different local frames** (each starts at its own SW corner), so A's coordinates cannot be read as B's without the fits above.
`);

mkdirSync('docs/compare', { recursive: true });
// overlay SVG per dataset: our footprints (blue), topo footprints (yellow), roads
for (const name of ['9CF709', '18D98C']) {
  const { tr, topo } = scenes[name];
  const pts = topo.buildings.flatMap((b) => b.ring.map(tr));
  const x0 = Math.min(...pts.map((p) => p[0])) - 30,
    z0 = Math.min(...pts.map((p) => p[1])) - 30;
  const w = Math.max(...pts.map((p) => p[0])) + 30 - x0,
    h = Math.max(...pts.map((p) => p[1])) + 30 - z0;
  const k = 1100 / w;
  const P = (p: Vec2) => `${((p[0] - x0) * k).toFixed(1)},${((p[1] - z0) * k).toFixed(1)}`;
  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${(h * k).toFixed(0)}"><rect width="100%" height="100%" fill="#070d1c"/>`,
  ];
  data.roads.forEach((r) =>
    o.push(
      `<polyline points="${r.points.map(P).join(' ')}" fill="none" stroke="#252a33" stroke-width="2"/>`,
    ),
  );
  topo.roads.forEach((r) =>
    o.push(
      `<polyline points="${r.map((p) => P(tr(p))).join(' ')}" fill="none" stroke="#6b3a3a" stroke-width="1"/>`,
    ),
  );
  topo.contours.forEach((c) =>
    o.push(
      `<polyline points="${c.pts.map((p) => P(tr(p))).join(' ')}" fill="none" stroke="#3f8f6a" stroke-width="1" stroke-dasharray="5 4"/>`,
    ),
  );
  live.forEach((b) =>
    o.push(
      `<polygon points="${b.footprint.map(P).join(' ')}" fill="#5aa2ff" fill-opacity="0.18" stroke="#5aa2ff" stroke-width="1"/>`,
    ),
  );
  topo.buildings.forEach((b) =>
    o.push(
      `<polygon points="${b.ring.map((p) => P(tr(p))).join(' ')}" fill="none" stroke="#ffd04d" stroke-width="1"/>`,
    ),
  );
  o.push(
    `<text x="12" y="22" fill="#fff" font-family="sans-serif" font-size="14">topoexport-${name} (reference only). Blue: our footprints. Yellow: topo footprints. Dark red: topo roads. Green dashed: 5 m contours. Grey: our roads.</text></svg>`,
  );
  writeFileSync(`docs/compare/topo-${name}.svg`, o.join('\n'));
}
writeFileSync('docs/topo-compare.md', md.join('\n'));
console.log(md.join('\n').slice(0, 6000));
