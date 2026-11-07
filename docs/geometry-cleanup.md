# Geometry cleanup

Generated 2026-11-07 by `npm run cleanup-report` (same code the app runs at load: `src/lib/cleanup.ts`).

Rules: close rings; snap or drop vertices within 0.3 m; cut self-intersections (keep the larger loop); drop slivers under 20 m²; drop polygons wholly beyond the boundary + 30 m buffer. Heights/z-fighting: every ground layer keeps its own height step, `polygonOffset` and `renderOrder` (`src/scene/theme.ts` LAYER).

## Ground polygons
| Layer | in | closed/deduped | self-intersections cut | slivers dropped | beyond buffer | out |
|---|---|---|---|---|---|---|
| green | 27 | 0 | 0 | 1 | 0 | 26 |
| water | 3 | 0 | 0 | 0 | 0 | 3 |
| bare | 22 | 0 | 0 | 0 | 4 | 18 |
| plazas | 0 | 0 | 0 | 0 | 0 | 0 |
| parking | 31 | 0 | 0 | 0 | 3 | 28 |
| pitches | 27 | 0 | 0 | 0 | 0 | 27 |

Marsh (natural=wetland, drawn dotted, not solid water): 1 polygon(s). The lake stays solid water.

## Buildings
231 in, 0 self-intersecting (reported, not altered: footprints are verified shapes), 54 dropped beyond the buffer, 177 out.

## Roads and paths (clipped at boundary + 30 m, faded over the last 60 m, stubs under 8 m removed)
| | in | clipped | wholly outside | stubs removed | out |
|---|---|---|---|---|---|
| roads | 381 | 13 | 176 | 12 | 196 |
| footways | 205 | 0 | 15 | 5 | 185 |
