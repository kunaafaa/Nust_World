/**
 * Rebuilds the data reports from nust-full.geojson + landmarks.ts:
 *   docs/data-gaps.md · docs/position-audit.md · docs/feature-check.md · docs/needs-osm-outline.md
 * Run: npm run audit
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { EXPECTED } from '../src/data/expected-features';
import { HIDDEN_LANDMARK_IDS } from '../src/data/extras';
import { landmarks } from '../src/data/landmarks';
import { buildCampus, parseHeight } from '../src/lib/campus';
import {
  centroid,
  dist,
  GAP_SNAP_NOTE,
  polygonArea,
  pointInPolygon,
  project,
  unproject,
} from './audit-helpers';
import { buildGraph, largestComponent, nearestNode } from '../src/lib/routing';
import { names, parseOsm, type RawOsm } from '../src/lib/osm';
import type { Vec2 } from '../src/lib/types';
import { applyTopoMerge, type TopoMergeFile, type TopoTreesFile } from '../src/lib/topoMerge';

const tryJson = <T>(p: string): T | null => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
};
const osm = JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm;
// The audits run on exactly what the app shows: OSM + the topo merge (if its files exist).
const merge = tryJson<TopoMergeFile>('public/data/topo-merge.json');
const topoStats = tryJson<{
  buildings: {
    excludedByOverride: { kind: string; upstream: string }[];
    excludeUpstream: string[];
    skippedUnder100: number;
    deferredHostels: { place: string }[];
  };
}>('docs/.topo-merge-stats.json');
const data = applyTopoMerge(
  buildCampus({ osm, landmarks }),
  merge,
  tryJson<TopoTreesFile>('public/data/topo-trees.json'),
);
const feats = parseOsm(osm);
const r = data.report;
const today = new Date().toISOString().slice(0, 10);
const list = (xs: string[], none = '_none_') =>
  xs.length ? xs.map((x) => `- ${x}`).join('\n') : none;

// ───────── routing graph ─────────
const ways = [...data.footways, ...data.roads.filter((x) => x.kind !== 'busway')];
const graph = buildGraph(ways);
const main = largestComponent(graph);
const rawGraph = buildGraph(ways.map((w) => w)); // same builder; snapped count reported below
const live = data.places.filter((p) => !p.offCampus);
const unreachable = live.filter((p) => {
  const id = nearestNode(graph, p.pos);
  return id < 0 || !main.has(id) || dist(graph.nodes[id].pos, p.pos) > 80;
});
const gates = live.filter((p) => p.category === 'gate');
const unreachableGates = unreachable.filter((p) => p.category === 'gate');

// ───────── position audit ─────────
const overlaps: string[] = [];
const bs = data.buildings.filter((b) => !b.offCampus);
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
const boxes = bs.map((b) => bbox(b.footprint));
for (let i = 0; i < bs.length; i++)
  for (let j = i + 1; j < bs.length; j++) {
    const a = boxes[i],
      b = boxes[j];
    if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
    // Overlap if a vertex of one lies inside the other (cheap, catches real overlaps; ignores shared walls).
    const inside = (p: Vec2, o: Vec2[]) => pointInPolygon(p, [o]);
    const shrink = (r: Vec2[]): Vec2[] => {
      const c = centroid(r);
      return r.map((p) => [p[0] + (c[0] - p[0]) * 0.04, p[1] + (c[1] - p[1]) * 0.04] as Vec2);
    };
    const sa = shrink(bs[i].footprint),
      sb = shrink(bs[j].footprint);
    if (sa.some((p) => inside(p, bs[j].footprint)) || sb.some((p) => inside(p, bs[i].footprint)))
      overlaps.push(`${bs[i].name ?? bs[i].id} ↔ ${bs[j].name ?? bs[j].id}`);
  }
const onWater = bs.filter((b) =>
  data.water.some((w) => pointInPolygon(centroid(b.footprint), [w.points])),
);
const ROAD_HALF: Record<string, number> = {
  trunk: 6,
  secondary: 4,
  tertiary: 4,
  residential: 3,
  service: 1.8,
  unclassified: 3,
};
const onRoad = bs.filter((b) => {
  const c = centroid(b.footprint);
  return data.roads.some(
    (rd) =>
      (ROAD_HALF[rd.kind] ?? 0) > 0 &&
      rd.points.some((p, i) => {
        if (!i) return false;
        const a = rd.points[i - 1],
          dx = p[0] - a[0],
          dz = p[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
        );
        return (
          Math.hypot(c[0] - (a[0] + t * dx), c[1] - (a[1] + t * dz)) < (ROAD_HALF[rd.kind] ?? 0)
        );
      }),
  );
});
const dupNames = Object.entries(
  landmarks.reduce<Record<string, string[]>>((m, l) => {
    (m[l.name.toLowerCase()] ??= []).push(l.id);
    return m;
  }, {}),
).filter(([, v]) => v.length > 1);
const closePairs: string[] = [];
const lp = landmarks.filter((l) => !l.offCampus).map((l) => ({ l, p: project(l.lng, l.lat) }));
for (let i = 0; i < lp.length; i++)
  for (let j = i + 1; j < lp.length; j++)
    if (dist(lp[i].p, lp[j].p) < 3)
      closePairs.push(`${lp[i].l.name} / ${lp[j].l.name} (${dist(lp[i].p, lp[j].p).toFixed(1)} m)`);

writeFileSync(
  'docs/position-audit.md',
  `# Position audit

Generated by \`npm run audit\` on ${today} from nust-full.geojson (timestamp ${r.timestamp ?? '?'}).

## Landmarks whose lat/lng is outside their own footprint (moved to the polylabel centre at runtime)
${list(r.moved.map((m) => `\`${m.id}\`: moved ${m.metres} m`))}

## Duplicates
- Same name in landmarks.ts: ${dupNames.length ? dupNames.map(([n, v]) => `${n} → ${v.join(', ')}`).join('; ') : '_none_'}
- Landmarks within 3 m of each other:
${list(closePairs)}

## Overlapping footprints (${overlaps.length})
${list(overlaps.slice(0, 40))}

## Buildings whose centre is on water (${onWater.length})
${list(onWater.map((b) => b.name ?? b.id))}

## Buildings whose centre lies on a road centreline corridor (${onRoad.length})
${list(onRoad.map((b) => `${b.name ?? 'unnamed'} (\`${b.id}\`)`).slice(0, 40))}

## Routing graph
- Nodes ${graph.nodes.length} · dangling path ends joined across gaps under ${GAP_SNAP_NOTE} m: **${graph.snapped}** (snapped automatically)
- Largest connected component holds ${main.size} of ${graph.nodes.length} nodes (${((main.size / graph.nodes.length) * 100).toFixed(1)}%)
- Places with no reachable path node within 80 m (${unreachable.length} of ${live.length}):
${list(unreachable.map((p) => `${p.shortName} (${p.category})`).slice(0, 40))}
- Gates: ${gates.length}, unreachable: **${unreachableGates.length}**${unreachableGates.length ? ' → ' + unreachableGates.map((g) => g.shortName).join(', ') : ''}
`,
);

// ───────── data gaps ─────────
const liveLm = landmarks.filter(
  (l) => !l.offCampus && !/^\d+$/.test(l.name) && !HIDDEN_LANDMARK_IDS.includes(l.id),
);
const suspicious: string[] = [];
for (const f of feats) {
  if (f.geom.kind !== 'poly' || !f.tags.building) continue;
  const h = parseHeight(f.tags.height);
  const lv = parseFloat(f.tags['building:levels'] ?? '');
  const nm = f.tags.name ?? f.id;
  if (h && !lv) suspicious.push(`${nm}: height ${f.tags.height} but no levels (\`${f.id}\`)`);
  else if (h && lv && h / lv > 6)
    suspicious.push(
      `${nm}: ${h.toFixed(1)} m for ${lv} floors = ${(h / lv).toFixed(1)} m/floor (\`${f.id}\`)`,
    );
  if (f.tags.height === '0') suspicious.push(`${nm}: height tag is 0 (ignored)`);
}
for (const l of landmarks)
  if (l.heightM && l.levels && l.heightM / l.levels > 6)
    suspicious.push(`${l.name}: landmarks.ts ${l.heightM} m for ${l.levels} floors`);
const unnamedB = feats.filter(
  (f) => f.tags.building && f.geom.kind === 'poly' && !f.tags.name,
).length;

writeFileSync(
  'docs/data-gaps.md',
  `# Data gaps

Generated by \`npm run audit\` on ${today}. Fill these in \`src/data/landmarks.ts\` (facts) or \`src/data/heights.ts\` (heights/roofs).

## Source
- \`public/data/nust-full.geojson\` (OSM, ODbL). Overpass timestamp: **${r.timestamp ?? 'unknown'}**
- Landmarks: ${r.landmarks} · matched by osmId: **${r.matched}** · without footprint: **${r.noFootprint.length}**
- Named buildings in OSM that landmarks.ts does not list (shown as unverified places): **${r.osmPlaces}**
${list(r.footprintsWithoutLandmark.map((x) => `${x.name} (\`${x.id}\`)`))}
- Hidden off-campus: ${r.hiddenOffCampus} · removed joke entry: ${HIDDEN_LANDMARK_IDS.join(', ')} · unit labels 205–212: not buildings in search
- Flat named features (gates, grounds, parking, cafes, lake): **${r.extraPlaces}**

## Heights
Height sources used: ${Object.entries(r.heightSources)
    .map(([k, v]) => `${k} ×${v}`)
    .join(' · ')}
Buildings falling back to a **category default** need floor counts from you.

### Suspicious OSM heights (${suspicious.length})
${list(suspicious)}

## On-campus landmarks (${liveLm.length})
- Verified: **${liveLm.filter((l) => l.verified).length} / ${liveLm.length}**
- Entrance not set: **${liveLm.filter((l) => !l.entrance).length}** (see \`docs/entrance-suggestions.md\`; routes end at the nearest path point, labelled "approximate entrance")
- No levels/heightM: ${liveLm.filter((l) => !l.levels && !l.heightM).length}
${list(liveLm.filter((l) => !l.levels && !l.heightM).map((l) => `${l.shortName} (\`${l.id}\`)`))}
- Description still "Info coming soon": ${liveLm.filter((l) => l.description === 'Info coming soon').length}
- Opening hours: not in the landmark schema

## Units / hostel blocks
Numeric entries (205–212) are drawn as hostel-tinted blocks and are not searchable. Their parent hostel is unknown.

## Unnamed buildings
${unnamedB} buildings have no name in OSM. They render as plain blocks with the default height and are not searchable.

## Still missing from OSM
See \`docs/feature-check.md\` (MISSING / AMBIGUOUS) and \`docs/needs-osm-outline.md\`.
- Entrance nodes mapped: ${feats.filter((f) => f.tags.entrance).length}
- Tagging errors worth fixing upstream: NBS ground is tagged \`school\`, "NBS" is tagged parking, "SNS New Building" is tagged as a pitch.
- Ground is flat. A DEM (elevation model) is a future TODO.
`,
);

// ───────── feature check ─────────
const cands = [
  ...feats
    .filter((f) => !f.tags.highway)
    .map((f) => ({
      ids: names(f.tags).map((n) => n.toLowerCase()),
      where:
        f.geom.kind === 'point'
          ? f.geom.p
          : f.geom.kind === 'poly'
            ? centroid(f.geom.rings[0])
            : f.geom.pts[0],
      ref: f.id,
    })),
  ...data.places.map((p) => ({
    ids: p.aliases.map((a) => a.toLowerCase()),
    where: p.pos,
    ref: p.id,
  })),
];
const rows: string[] = [];
const tally = { FOUND: 0, MISSING: 0, AMBIGUOUS: 0 };
for (const e of EXPECTED) {
  const res = e.match.map((m) => new RegExp(m, 'i'));
  const hits = cands.filter((c) => c.ids.some((n) => res.some((rx) => rx.test(n))));
  const clusters: { where: Vec2; refs: string[] }[] = [];
  for (const h of hits) {
    const c = clusters.find((k) => dist(k.where, h.where) < 90);
    if (c) c.refs.push(h.ref);
    else clusters.push({ where: h.where, refs: [h.ref] });
  }
  const status = clusters.length === 0 ? 'MISSING' : clusters.length === 1 ? 'FOUND' : 'AMBIGUOUS';
  tally[status]++;
  const detail = clusters
    .map(
      (k) =>
        `${unproject(k.where[0], k.where[1])
          .map((v) => v.toFixed(5))
          .reverse()
          .join(',')} (${[...new Set(k.refs)].slice(0, 2).join(', ')})`,
    )
    .join(' · ');
  rows.push(`| ${e.group} | ${e.label} | **${status}** | ${detail || '—'} |`);
}
writeFileSync(
  'docs/feature-check.md',
  `# Feature check

Generated ${today}. FOUND ${tally.FOUND} · AMBIGUOUS ${tally.AMBIGUOUS} · MISSING ${tally.MISSING} (of ${EXPECTED.length}).
FOUND = exactly one location. AMBIGUOUS = several locations more than 90 m apart (e.g. multiple football grounds, Gate 4 vs Gate 04).
MISSING = nothing in OSM or landmarks.ts matches: needs mapping in OSM or an entry in landmarks.ts.

| Group | Expected | Status | Where (lat,lng) |
|---|---|---|---|
${rows.join('\n')}
`,
);

// ───────── needs OSM outline ─────────
function topoSection(): string {
  if (!merge) return '';
  const row = (r: [number, number][]) => {
    const c = centroid(r.map(([lng, lat]) => project(lng, lat)));
    const [lng, lat] = unproject(c[0], c[1]);
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  };
  const ex = topoStats?.buildings.excludedByOverride ?? [];
  return `
## Buildings added from Overture (not in OSM): please map them
Overture release ${merge.overtureRelease}. These are drawn as **provisional** (dashed outline, default height, unnamed). They are ML-derived outlines, **not verified**: check each on site or on imagery you may use, then trace the real ones in OSM. Added outlines have no name; only hostel outlines inside a named OSM hostel area or around a named OSM point carry that name (never guessed).

| # | Location (lat, lng) | Area | Upstream | Confidence |
|---|---|---|---|---|
${merge.additions.map((a, i) => `| ${i + 1} | ${row(a.ring)} | ${a.areaM2} m² | ${a.upstream} | ${a.confidence} |`).join('\n') || '| none | | | | |'}

Hostel outlines from Overture: ${merge.hostels.length} (${[...new Set(merge.hostels.map((h) => h.placeName))].join(', ') || 'none'}).
${topoStats?.buildings.deferredHostels.length ? `Deferred (not drawn): ${[...new Set(topoStats.buildings.deferredHostels.map((h) => h.place))].join(', ')}: some outlines in this area come only from an excluded upstream, so the provisional block stays.` : ''}

Left out by the override list (${topoStats?.buildings.excludeUpstream.join(', ') || 'none'}): ${ex.length} outlines (${ex.filter((e) => e.kind === 'addition').length} additions, ${ex.filter((e) => e.kind.startsWith('hostel')).length} hostel footprints). Under 100 m² without an OSM counterpart: ${topoStats?.buildings.skippedUnder100 ?? 0}, not added.
`;
}

writeFileSync(
  'docs/needs-osm-outline.md',
  `# Hostels and areas that need an OSM outline

Generated ${today}. Provisional blocks are drawn with **dashed outlines** and a "provisional" tag. They are inset 3 m from
the area polygon and use the hostel default height. They are NOT real building shapes. Trace the real outlines in OSM
(\`building=dormitory\` or \`building=yes\` + \`name=…\`), re-export, and they replace the provisional blocks automatically.

${list(r.needsOutline)}

Provisional blocks currently generated: ${r.provisional.map((p) => `${p.name} (${p.areaM2} m²)`).join(', ') || 'none'}.
${topoSection()}`,
);

console.log({
  moved: r.moved.length,
  overlaps: overlaps.length,
  onWater: onWater.length,
  onRoad: onRoad.length,
  snapped: graph.snapped,
  unreachable: unreachable.length,
  feature: tally,
  suspicious: suspicious.length,
  rawNodes: rawGraph.nodes.length,
});
