# Known issues

## Terrain

- The source is a 30 m elevation model (EDTM) contoured at 5 m, so terrain is **approximate** (RMS 1.2 to 1.6 m vs the exports, max 4.9 m). It is default OFF.
- Each building sits on its lowest footprint corner; steep sites may show a gap on the uphill side. Shadows follow the displaced geometry.
- Route distance and time account for slope only when terrain is on; the route itself is found on the flat graph.

## Topo merge

- Google Open Buildings outlines are excluded (licence unclear): about 27 more buildings could be added if you allow them.
- Overture buildings from ML upstreams are unverified shapes; they are always dashed.
- Tree sizes in the source are mostly uniform (6 m tall, 3 m crown).

## Campus edge (production pass)

- Boundary = the OSM `amenity=university` polygon (way/407719491, 286.7 ha). If OSM mappers change that polygon, run `npm run boundary` (and `npm run cleanup-report`). The context roads (`data/context-roads.json`, 725 road ways, ±400 m) are a one-time Overpass fetch: re-run `npx tsx scripts/fetch-context-roads.ts` to refresh.
- `/reference/look/campus-outline-ref.png` was not in the project, so the shape was not compared against it. The derived shape comes only from OSM.
- 54 buildings and 176 road ways lying beyond the boundary buffer are no longer drawn (they remain in the raw OSM file).
- Edge fade is done in the shader by mixing colour into the base ground (no alpha), so it cannot show sorting artefacts; very large polygons beyond the buffer still exist as geometry but are invisible.
- Zoom-out is capped at 1500 m and tilt at 66 degrees so the horizon never shows. At max zoom-out on the very edge you see empty dark ground, by design.
- Frame rate was not measured on a real phone (headless software GL only). New draw calls: marsh, context roads, 2 border lines (4 total). MSAA x4 on Medium/High; Low has no post-processing, and no clouds.
- Only console message is the library's `THREE.Clock` deprecation warning.
