# Topo data report (Stage 1: inspection)

Inspected 2026-11-07. All files were opened as bytes/data only. Nothing was executed, and nothing was extracted outside `reference/`.

## Verdict

| Dataset                       | What it is                              | Georeferenced          | Covers NUST H-12           | Status             |
| ----------------------------- | --------------------------------------- | ---------------------- | -------------------------- | ------------------ |
| `reference/toposection`       | 1-D elevation cross-section, ~998 m     | No (position inferred) | A single line only         | **Reference only** |
| `reference/topoexport-9CF709` | 2D plan + 3D model export, 855 × 782 m  | No (fitted)            | Yes, SW part of the campus | **Reference only** |
| `reference/topoexport-18D98C` | 2D plan + 3D model export, 1049 × 953 m | No (fitted)            | Yes, the main campus       | **Reference only** |

None of them has a stated licence for the export itself, so by the rule "if unsure, reference only" all three are **reference only**: used to CHECK our positions and heights, never copied into `/public`, `nust-full.geojson`, `landmarks.ts`, `heights.ts` or anything deployed. The underlying sources are open (see Licence), but that is a separate question from what the exports allow.

## Files

| Folder            | File                          | Type                                                         | Size        |
| ----------------- | ----------------------------- | ------------------------------------------------------------ | ----------- |
| toposection       | `LICENSE.txt`                 | text                                                         | 1,315 B     |
| toposection       | `toposection.dxf`             | ASCII DXF AC1018, section drawing                            | 3,922,666 B |
| toposection       | `toposection.svg`             | SVG of the same drawing                                      | 5,094,453 B |
| toposection       | `topoexport-9CF709.zip`       | archive, a copy of dataset 9CF709 (same 3 files, same sizes) | 972,290 B   |
| topoexport-9CF709 | `LICENSE.txt`                 | text                                                         | 2,174 B     |
| topoexport-9CF709 | `topoexport_2D_vectorial.dxf` | **binary** DXF AC1024, plan view                             | 1,204,627 B |
| topoexport-9CF709 | `topoexport_3D_modeling.dxf`  | **binary** DXF AC1024, 3D (z = elevation)                    | 3,828,423 B |
| topoexport-18D98C | `LICENSE.txt`                 | text                                                         | 2,174 B     |
| topoexport-18D98C | `topoexport_2D_vectorial.dxf` | binary DXF AC1024                                            | 1,897,949 B |
| topoexport-18D98C | `topoexport_3D_modeling.dxf`  | binary DXF AC1024                                            | 5,866,452 B |

Both `topoexport-*/LICENSE.txt` files are byte-identical to each other. There are no `.prj`, `.tfw`, `.xml`, `.json`, `.kml`, `.geojson`, `.shp`, GeoTIFF or CSV files in any folder. Header fields read from the DXFs: `$ACADVER` AC1024, `$INSUNITS` 6 (metres), `$INSBASE` 0,0,0. No coordinate system is recorded.

## Common facts (all three come from the same producer)

- **Producer:** TopoExport.com. Export date 2026-11-07 (file times). The data vintages are "2026" Overture releases, EDTM 2023, canopy v2.
- **Sources (from `LICENSE.txt`):**

| Element                                                   | Source                                                                        | Licence       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------- |
| Buildings, roads, railways, waterways, green areas, trees | Overture Maps Foundation 2026                                                 | **ODbL**      |
| Tree/canopy surface                                       | Meta + World Resources Institute, Global Canopy Height Maps v2                | **CC BY 4.0** |
| Terrain (30 m)                                            | OpenGeoHub EDTM 2023 (Ho, Hengl, Parente 2023, Zenodo 10.5281/zenodo.7676373) | **CC BY 4.0** |

- **Disclaimer:** the exporter accepts no responsibility for errors and tells users to verify with surveyors.
- **Accuracy:** buildings and roads are Overture data, which for Pakistan is largely **derived from OpenStreetMap** and other crowd or ML sources. It is not survey-grade. Terrain is 30 m cells, so it describes the broad slope, not building-scale relief.
- **CRS:** none recorded. The fit to our footprints gives a rotation of about 1.1° against true north for both exports, matching UTM zone 43 grid convergence at this longitude, so the local metres are **a north-up UTM 43N grid** with the origin at the south-west corner of the frame. This is inferred, not stated.

## Licence check

- **What the exports allow is not stated.** The licence file lists the source licences only. It grants no redistribution or public display rights for the export, and gives none for the derivative.
- **Sources are open.** ODbL (Overture) and CC BY 4.0 (EDTM, canopy) are compatible with OSM data in principle, but ODbL share-alike and attribution would apply to anything we took from the buildings or roads, and CC BY 4.0 requires attribution.
- **Decision: all three are reference only.** Allowed: checking our positions and heights, writing findings in `docs/`. Not allowed: copying geometry, heights, contours or terrain into the product.
- **If you want terrain or buildings in the product,** take them from the original sources under their own licences: EDTM from Zenodo (CC BY 4.0, attribution: Ho, Hengl, Parente 2023, EDTM v1.1, https://doi.org/10.5281/zenodo.7676373) or buildings from Overture directly (ODbL, share-alike). That means downloading a file, which I will not do without your OK.

## 1. toposection

See `docs/toposection-report.md` for the full inspection. In short: a 998.4 m vertical section (ASCII DXF/SVG), terrain 546.1 m rising to 562.7 m, 5 buildings crossed, 39 road crossings, 4 green areas. No contours, spot heights or names. A 1-D strip, so it can only check positions along its own line.

## 2. topoexport-9CF709 (frame 855.2 × 782.3 m)

| Item          | Content                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2D layers     | buildings 191 (+183 height labels, 183 area labels), roads (axes 215, outlines 143), green spaces 33, waterways 10, trees 2,841, 5 m contours 12 (+12 labels)               |
| 3D layers     | building meshes 183, road meshes 197, terrain mesh (1,763 vertices, z 538.5–563.3 m), contour polylines 12 (z 540–560), waterway outlines, green space meshes, trees with z |
| Fitted extent | SW 33.63835, 72.98297 → NE 33.64553, 72.99204. Covers the south and west part of campus, ending short of the north-east.                                                    |
| Heights       | 180 of 191 buildings labelled exactly 6.0 m: a default                                                                                                                      |
| Names         | none                                                                                                                                                                        |

## 3. topoexport-18D98C (frame 1048.6 × 953.2 m)

| Item          | Content                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2D layers     | buildings 217 (+209 height / 209 area labels), road axes 311, road outlines 243, green 32, waterways 11, trees 5,126, 5 m contours 18 |
| 3D layers     | building meshes 209, road meshes 280, terrain mesh (2,650 vertices, z 539.3–581.6 m), contours z 540–580                              |
| Fitted extent | SW 33.64077, 72.98442 → NE 33.64952, 72.99555. Covers the main campus, further north and east than 9CF709.                            |
| Heights       | 204 of 217 labelled exactly 6.0 m: a default                                                                                          |
| Names         | none                                                                                                                                  |

## How the datasets relate

- **Same producer, same source stack, same export date.** Not independent of each other.
- **Different frames over overlapping ground.** 18D98C (1049 × 953 m) is larger and shifted north-east of 9CF709 (855 × 782 m); 9CF709 reaches further south-west. Each is in its own local frame.
- **Consistent where they overlap.** 90 buildings pair up with a median centroid separation of 0.8 m and no height label disagreements (0 of 89). Terrain at shared locations agrees to a mean of 0.3 m, though there are local differences of up to 6.7 m, which is plausible for a 30 m model resampled on different grids.
- **Toposection vs the two exports.** The section's building crossings come from the same Overture buildings; its zip folder contains a copy of 9CF709.

## What each could add to our map

| Feature                         | toposection       | 9CF709 / 18D98C                             | Usable now?                                        |
| ------------------------------- | ----------------- | ------------------------------------------- | -------------------------------------------------- |
| Elevation / terrain             | profile line only | 30 m terrain mesh + 5 m contours            | No: reference only. Future: from the original EDTM |
| Contours                        | none              | 5 m (540–580 m)                             | No: same                                           |
| Building heights                | 5 labels          | 380 labels, 94% are the 6.0 m default       | No: weak evidence only (see compare)               |
| Building footprints             | 5 crossings       | ~400 Overture footprints                    | Cross-check only; mostly derived from OSM          |
| Boundaries, names, spot heights | none              | none                                        | n/a                                                |
| Missing buildings               | 1                 | 35–43 over 60 m² that are not in our export | Proposals only                                     |
