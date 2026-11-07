# Progress

Last updated 2026-11-07.

## Built (Master Prompt, phases 1 to 8)

- **Data pipeline:** `nust-full.geojson` (OSM, ODbL) with landmarks.ts overrides, one tested projection, audits, feature check, provisional hostel block, dimensions, refresh and control-point scripts.
- **3D:** outline-style buildings with roof types and landmark shapes, layered ground with markings, trees (4 types), cars (6 models, parked and moving).
- **UI/game feel:** title fly-over, search, chips, labels, cards with Nearby, day/night, quality tiers, settings, sound, onboarding, tour, screenshot mode, list view, share, deep links.
- **Navigation/location:** worker A*, landmark directions, approximate-entrance wording, live location with accuracy circle, heading, follow, snapping, reroute, arrival, simulator, debug overlays.
- **Reliability:** 2D fallback map, error boundary, PWA offline, SEO, strict TS, ESLint, Prettier, 41 tests, production build passes.

## Toposection (reference dataset)

|                      |                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Stage 1 and 2 done.                                                                                                                                             |
| What it is           | 1-D cross-section DXF/SVG from TopoExport, about 998 m long, built from Overture Maps (ODbL) and CC BY 4.0 terrain/canopy. No georeference.                     |
| Licence status       | **Reference only.** Never copied into `/public`, geojson, landmarks.ts, heights.ts or any deployed asset.                                                       |
| Used for             | Position check. Inferred its line by matching to our footprints (IoU 0.966). Four of five building crossings match within about 0.4 m along the line.           |
| Findings             | One building missing from our map (about 33.64450, 72.98705); toposection heights look like generic estimates; terrain rises 546.1 m to 562.7 m along the line. |
| Not done, on purpose | No terrain layer (reference-only licence; one line cannot make a surface; no faked slopes). No offset applied (a section cannot measure a global shift).        |
| Files                | `docs/toposection-report.md`, `docs/toposection-compare.md`, `docs/proposed-corrections.md`, `docs/compare/overlay.png                                          | svg`, `docs/compare/profile.png | svg`, `scripts/toposection-locate.ts`, `scripts/toposection-compare.ts` |

## Open items (need you)

Floor counts, entrances, building photos (NSTP), 10+ GPS control points, hostel outlines in OSM, the 9 missing features, a feedback address. Details in README "What I need from you".

## Future TODO

- Terrain layer from the original CC BY 4.0 EDTM or a DEM with a clear licence, optional and off by default.
- Split three.js postprocessing out of the first-load bundle (556 KB gzip today).
- Measure real phone frame rates with `?debug=1`.

## Topoexport datasets (reference data, second batch)

|                      |                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datasets             | `reference/topoexport-9CF709` (855 × 782 m) and `reference/topoexport-18D98C` (1049 × 953 m): binary DXF (AC1024), 2D plan + 3D model, Overture (ODbL) + EDTM/canopy (CC BY 4.0).                       |
| Licence status       | **Reference only** (export terms unstated). Never copied into `/public`, geojson, landmarks.ts, heights.ts or any deployed asset.                                                                       |
| Georeference         | None in file. Fitted to our footprints; both give the same 1.1° rotation = UTM 43 grid convergence, so they are north-up UTM.                                                                           |
| Used for             | Position and height checks. Matched same-size buildings agree to a median 0.7 to 0.9 m; no systematic shift. Agreement is expected (Overture largely imports OSM), so it is not independent proof.      |
| Findings             | 3 positional differences over 3 m (Ghazali 2, Rumi I, Swimming Pool Area); 41 possible missing footprints (unverified); SEECS blocks and NUST School of Health Sciences heights worth checking on site. |
| Not done, on purpose | No terrain layer (reference-only licence; 30 m model); no offset applied; no data copied.                                                                                                               |
| Files                | `docs/topo-data-report.md`, `docs/topo-compare.md`, `docs/proposed-corrections.md`, `docs/compare/topo-*.svg                                                                                            | png`, `scripts/topo-fit.ts`, `scripts/topo-compare.ts`, `scripts/lib/topo.ts` |
| Terrain TODO         | If you want terrain, download the original EDTM tile from Zenodo (CC BY 4.0, needs your OK to download) and build an optional off-by-default layer in the Night Outline style.                          |

## Topo merge (2026-11-07)

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Done      | Overture downloaded directly (DuckDB, no pip); exact UTM 43N georeference (0.005 m); non-destructive merge (`npm run topo-merge`) into `public/data/topo-*.json`; runtime `applyTopoMerge` (`?topo=off` disables); 16 provisional buildings, 1 duplicate suppressed, 2 flags, 6,025 real trees, optional terrain (default off, `?terrain=1`); footer/About/README attribution; `LICENSE-DATA.md`; `data/topo-overrides.json`; audits run on merged data. |
| Tests     | 62 passing (21 new in `tests/topoMerge.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                        |
| Docs      | `docs/topo-merge-report.md`, `docs/field-checklist.md`, `docs/known-issues.md`, `docs/needs-osm-outline.md`, screenshots in `docs/compare/` (`*-before`, `*-after`, `terrain-on`, `terrain-off`).                                                                                                                                                                                                                                                        |
| Needs you | Google Open Buildings exclusion; SEECS/Health Sciences floors; items in `docs/field-checklist.md`.                                                                                                                                                                                                                                                                                                                                                       |

## Campus edge, production pass (2026-11-07)

|       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Done  | Boundary from OSM (`data/campus-boundary.geojson`, 286.7 ha, 91 to 64 vertices, simplified 2 m, no self-intersections, CCW); context ring of 725 faded road lines; every ground layer feathers into the dark base at boundary + 30 m (shader SDF); roads fade over the last 60 m and are clipped at the buffer; dead-end stubs under 8 m removed; wetland drawn as dotted marsh, lake stays solid; glowing campus border (theme token, pulses on title); sky/fog horizon unified, plane 24 km, dome follows camera; clouds smaller, high, faded near camera/selection, off on Low; MSAA x4; camera soft-bounce at boundary, zoom max 1500, polar max 66 degrees; boundary vertices in `?debug=1`; PWA cache v3-edge; OG image uses the clean map. |
| Tests | 72 passing (10 new in `tests/edge.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Docs  | `docs/geometry-cleanup.md`, `docs/known-issues.md`; screenshots `docs/compare/edge-*` (`-before` is `?edge=off`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
