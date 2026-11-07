/** Writes docs/geometry-cleanup.md: what the boundary clip and polygon cleanup removed or fixed. Run: npm run cleanup-report */
import { readFileSync, writeFileSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { buildCampus } from '../src/lib/campus';
import { applyBoundary } from '../src/lib/cleanup';
import { parseBoundary } from '../src/lib/context';
import type { RawOsm } from '../src/lib/osm';
import { applyTopoMerge, type TopoMergeFile, type TopoTreesFile } from '../src/lib/topoMerge';

const j = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const merged = applyTopoMerge(
  buildCampus({ osm: j<RawOsm>('public/data/nust-full.geojson'), landmarks }),
  j<TopoMergeFile>('public/data/topo-merge.json'),
  j<TopoTreesFile>('public/data/topo-trees.json'),
);
const ring = parseBoundary(j('public/data/campus-boundary.geojson'));
const { report: r } = applyBoundary(merged, ring);
const rows = Object.entries(r.polygons)
  .map(
    ([k, v]) =>
      `| ${k} | ${v.in} | ${v.closedOrDeduped} | ${v.selfIntersectionsFixed} | ${v.slivers} | ${v.outside} | ${v.out} |`,
  )
  .join('\n');
writeFileSync(
  'docs/geometry-cleanup.md',
  `# Geometry cleanup

Generated ${new Date().toISOString().slice(0, 10)} by \`npm run cleanup-report\` (same code the app runs at load: \`src/lib/cleanup.ts\`).

Rules: close rings; snap or drop vertices within 0.3 m; cut self-intersections (keep the larger loop); drop slivers under 20 m²; drop polygons wholly beyond the boundary + 30 m buffer. Heights/z-fighting: every ground layer keeps its own height step, \`polygonOffset\` and \`renderOrder\` (\`src/scene/theme.ts\` LAYER).

## Ground polygons
| Layer | in | closed/deduped | self-intersections cut | slivers dropped | beyond buffer | out |
|---|---|---|---|---|---|---|
${rows}

Marsh (natural=wetland, drawn dotted, not solid water): ${r.marsh} polygon(s). The lake stays solid water.

## Buildings
${r.buildings.in} in, ${r.buildings.selfIntersecting} self-intersecting (reported, not altered: footprints are verified shapes), ${r.buildings.outsideDropped} dropped beyond the buffer, ${r.buildings.out} out.

## Roads and paths (clipped at boundary + 30 m, faded over the last 60 m, stubs under 8 m removed)
| | in | clipped | wholly outside | stubs removed | out |
|---|---|---|---|---|---|
| roads | ${r.roads.in} | ${r.roads.clipped} | ${r.roads.droppedOutside} | ${r.roads.stubsRemoved} | ${r.roads.out} |
| footways | ${r.footways.in} | ${r.footways.clipped} | ${r.footways.droppedOutside} | ${r.footways.stubsRemoved} | ${r.footways.out} |
`,
);
console.log(JSON.stringify(r));
