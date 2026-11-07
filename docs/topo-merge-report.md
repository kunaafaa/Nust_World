# Topo merge report

Generated 2026-11-07 by `npm run topo-merge`. Data: Overture release 2026-10-21.0, downloaded directly (bbox 33.634,72.976,33.654,72.997), TopoExport files used for cross-check, contours and trees. Attribution: © OpenStreetMap contributors · Overture Maps Foundation · terrain/canopy data CC BY 4.0 (per the export licence files). Derived geodata is ODbL (`LICENSE-DATA.md`).

## Provenance of the download

- `pip install overturemaps` was not possible (no Python on this machine). The same GeoParquet was read straight from Overture's public S3 bucket with DuckDB (Node, installed only in a scratch folder). 2,314 buildings and 680 road segments in the bbox are in `data/overture/`.
- Upstream mix of those 2,314 buildings: Google Open Buildings 1,452 · Microsoft ML Buildings 658 · OpenStreetMap 204.
- **Decision to confirm: Google Open Buildings is excluded.** The records carry no licence field and the project rule is no Google data. 27 outlines that came only from it are left out (counted in `needs-osm-outline.md`). To include them: remove it from `excludeUpstream` in `data/topo-overrides.json`, then `npm run topo-merge`.
- The topo exports are the same Overture release, so the cross-check is not independent: 278 of 282 region buildings agree over 90%.

## Georeference (UTM 43N, 1.1° rotation removed)

The "rotation" is UTM grid convergence, so the exact UTM to WGS84 conversion removes it. Only the local origin is fitted. After conversion vs Overture direct: median centroid error **0.005 m** (18D98C, 205 buildings) and **0.004 m** (9CF709, 176), median IoU 1.00. Projection stays `src/lib/geo.ts`.

## Buildings (282 Overture buildings in the export frames)

|                                                        | Count                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Matched to OSM (IoU over 0.6)                          | 103 (+5 overlap only)                                                                   |
| Geometry replaced (rule 1)                             | **0**: no OSM footprint was merged, split or self-overlapping with a clean topo outline |
| Exact duplicate suppressed                             | 1 (way/1364559421, unnamed copy of Rumi II way/209832719; stops z-fighting)             |
| No OSM counterpart                                     | 174                                                                                     |
| of which under 100 m², not added                       | 130                                                                                     |
| of which excluded (Google upstream)                    | 27                                                                                      |
| **Added as provisional** (dashed, unverified, unnamed) | **16** (2,779 m², Microsoft upstream; 14 low, 2 medium confidence)                      |
| Flagged: OSM and topo differ by over 3 m (rule 4)      | 2: Ghazali 2 (10.9 m), Rumi I (10.9 m)                                                  |
| Heights taken from topo                                | 0 (rule 5; SEECS and Health Sciences untouched)                                         |

`data/topo-buildings.geojson` holds every region building with source, confidence and action.

## Hostels (rule 3)

- **Razi Hostel:** one outline found (1,704 m², inside OSM area way/209855481), deferred. Other outlines of its group come only from the excluded upstream, so the provisional block stays rather than silently dropping buildings.
- **Already real OSM outlines, nothing to replace:** 14 hostel buildings (Ghazali 1/2, Attar 1, Liaquat, Zakariya, Hajveri, Rumi I/II, Fatima I to III, Ayesha, Khadija).
- **No outline in Overture or OSM:** Rehmat, Attar 2, Amna.
- **Unnamed outlines:** none produced. Nothing was named by guess.

## Roads and paths

387 Overture segments lie outside the export frames (skipped), 293 are already mapped. **0 added**, 0 endpoints snapped; routing graph unchanged (4,064 nodes, largest component 3,977). A test checks connectivity can never drop.

## Green space and water

65 topo green polygons (43 over 400 m²): median coverage by our ground polygons 100%, none under 70%. **0 gaps added.**

## Trees

**6,025 individual trees** placed from `TPX_VEGETATION_TREES_INDIVIDUAL` at real positions, sizes from the block geometry (height and crown radius), type by shape (shrub, conifer, round). They replace the random scatter (Poisson fill, avenue and frontage trees) inside the export frames; scatter stays elsewhere. Trees on building footprints are dropped. Instancing and caps unchanged (6000/3000/1200).
Note: 5,465 of them have the identical size (6 m tall, 3 m crown): the source canopy model is coarse. Positions are real, size variety is limited.

## Terrain (optional, default OFF)

Settings, "Terrain (approximate)", or `?terrain=1`. 20 m grid (61 x 64) from the 5 m contours, smoothed. Relief on campus 541.4 to 579.1 m (about 38 m); origin 558.7 m. Error vs the export mesh: RMS 1.55 m (max 4.9 m); vs the contours RMS 1.24 m. Source is a 30 m model, so it is approximate. Buildings sit on their lowest corner; ground, roads, trees, cars, labels, markers and camera follow; route distance and time include slope when on. Flat ground stays the default, so the locked look and control-point checks are unaffected (a test asserts `groundY` is exactly 0 when off).

## Skipped, and why

- Heights: topo heights are mostly the 6.0 default or equal to OSM.
- Replacement of any OSM geometry: no case met the rule.
- Toposection (1-D line): still reference only.
- Visual-regression tests: the repo has none. Before/after screenshots are in `docs/compare/` instead.
