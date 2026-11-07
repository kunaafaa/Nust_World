/**
 * Suggests an entrance for each place: the point on the nearest footpath (else minor road) to its footprint.
 * Writes docs/entrance-suggestions.md ONLY. It never edits landmarks.ts: confirm on campus, then paste
 * the coordinates into the landmark's `entrance` field yourself. Until then routes end at the nearest path
 * point and are labelled "approximate entrance".
 *
 * Uses the single projection in src/lib/geo.ts. Run: npm run fill-entrances
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { buildCampus } from '../src/lib/campus';
import { buildSnapIndex } from '../src/lib/location';
import { unproject } from '../src/lib/geo';
import type { RawOsm } from '../src/lib/osm';

const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const foot = buildSnapIndex(data.footways.map((f) => f.points));
const road = buildSnapIndex(
  data.roads
    .filter((r) => /^(service|residential|living_street|unclassified|tertiary)$/.test(r.kind))
    .map((r) => r.points),
);

const rows: string[] = [];
let n = 0;
for (const p of data.places) {
  if (p.offCampus || p.flat || p.provisional || p.entrance || !p.footprints.length) continue;
  let best: { pos: [number, number]; dist: number; kind: string } | null = null;
  // Walk the footprint outline and keep the vertex-nearest path point (outline vertices approximate the wall).
  for (const v of p.footprints[0]) {
    for (const [idx, kind] of [
      [foot, 'footpath'],
      [road, 'road'],
    ] as const) {
      const hit = idx.snap(v, 60);
      if (hit && (!best || hit.dist < best.dist)) best = { pos: hit.pos, dist: hit.dist, kind };
    }
  }
  if (!best) continue;
  const [lng, lat] = unproject(best.pos[0], best.pos[1]);
  n++;
  rows.push(
    `| ${p.shortName} | \`${p.id}\` | ${lat.toFixed(6)}, ${lng.toFixed(6)} | ${best.dist.toFixed(0)} m | ${best.kind} |`,
  );
}

writeFileSync(
  'docs/entrance-suggestions.md',
  `# Entrance suggestions (UNVERIFIED)

Generated ${new Date().toISOString().slice(0, 10)}. **These are guesses**: the closest footpath/road point to each building outline.
Walk to the real door, then put the coordinates in the landmark's \`entrance: { lat, lng }\` in \`src/data/landmarks.ts\`.
Nothing here is used by the app.

${n} suggestions.

| Place | id | Suggested lat, lng | Distance from outline | Snapped to |
|---|---|---|---|---|
${rows.join('\n')}
`,
);
console.log('wrote docs/entrance-suggestions.md with', n, 'suggestions');
