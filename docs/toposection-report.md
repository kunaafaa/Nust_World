# Toposection report (Stage 1: inspection)

Inspected 2026-11-07. Files were opened as text/data only; nothing from the archive was executed, and nothing was extracted outside `reference/toposection/`.

## Verdict

|                   |                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| What it is        | A **2D side-elevation cross-section** (a "toposection"), not a plan map. About 998 m long, about 43 m of vertical range.                     |
| Georeferenced?    | **No.** No CRS, no coordinates, no sidecar files. Where it sits on Earth had to be inferred (see `docs/toposection-compare.md`).             |
| Covers NUST H-12? | Yes, but only a 1-D strip. Inferred line: 33.64679, 72.99176 → 33.64227, 72.98244 (heading about 240°). It is not an area dataset.           |
| Licence status    | **REFERENCE ONLY.** Used to check our positions. Not copied into `/public`, the geojson, `landmarks.ts`, `heights.ts`, or anything deployed. |

## Files

| File                     | Type                                                  | Size        |
| ------------------------ | ----------------------------------------------------- | ----------- |
| `LICENSE.txt`            | plain text                                            | 1,315 B     |
| `toposection.dxf`        | AutoCAD DXF, version AC1018 (2004), local coordinates | 3,922,666 B |
| `toposection.svg`        | SVG drawing of the same content                       | 5,094,453 B |
| `toposection-525B38.zip` | the original archive (kept in place)                  | 1,107,590 B |

## Metadata

- **Producer:** "TopoSection - Powered by TopoExport.com" (text in layer `TPS_COPYRIGHT`). File dates 2026-11-07.
- **Coordinates:** DXF x = metres along the section line (0 to 998.4); y = height in metres in the drawing (terrain between about 26.1 and 43.3 drawing units, plus building heights). The 470 tick labels give true terrain elevation, **546.1 m at x = 0 rising to 562.7 m at x = 998**. Unit scale of 1 = 1 m was confirmed because building widths along the line match our OSM footprints to within about 0.4 m.
- **Resolution/accuracy:** the terrain is the 30 m global model, so it shows the broad slope only (about 1.7 % over the line). Building and road positions are only as good as Overture Maps data, which is not survey-grade and is partly ML-derived. The producer's disclaimer says to verify with surveyors.
- **No** `.prj`, `.tfw`, `.xml`, `.json` or `.kml` sidecars exist. The DXF contains no georeference header (searched for EPSG, UTM, WGS, latitude/longitude, GEODATA).

## Licence (from `LICENSE.txt`)

The file lists the licences of the **sources**, not a licence for the export itself:

| Element                                         | Source                                                                         | Licence   |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| Buildings, roads, waterways, trees, green areas | Overture Maps Foundation 2026                                                  | ODbL      |
| Digital Surface Model / canopy                  | Meta and World Resources Institute, Global Canopy Height Maps v2               | CC BY 4.0 |
| Terrain (30 m)                                  | OpenGeoHub Ensemble Digital Terrain Model 2023 (Zenodo 10.5281/zenodo.7676373) | CC BY 4.0 |
| Interactive map front-end                       | Leaflet and OpenStreetMap contributions                                        | n/a       |

It also says the exporter takes no responsibility for errors. **There is no explicit grant for redistributing or publicly displaying the export, and Overture's ODbL share-alike terms would apply to anything derived from its buildings and roads.** I cannot tell from the file what is allowed beyond checking, so by the rule "if you cannot tell, treat it as reference only":

- Allowed: compare against our data, write findings and proposals in `docs/` (not deployed).
- Not allowed: copying its geometry, heights or terrain into the app, the geojson, `landmarks.ts`, `heights.ts` or `/public`.
- If you want its underlying data in the product, take it from the **original sources** under their own licences: the terrain from the Zenodo EDTM dataset (CC BY 4.0, attribution required) or the buildings from Overture directly (ODbL, share-alike, and check it is compatible with how you publish).

## Contents

| Layer                                     | Content                                                                        | Count     |
| ----------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| `TPS_BUILDINGS` (+ `_BG`)                 | buildings the line crosses (5) and buildings seen behind it                    | 5 + 1,386 |
| `TPS_BUILDING_HEIGHTS_TEXT`               | height labels for the 5 crossed buildings: +5.81, +5.41, +5.82, +5.07, +5.65 m | 5         |
| `TPS_BUILDING_DIMENSIONS(_TEXT)`          | along-line distances between buildings                                         | 35 / 11   |
| `TPS_ROADS`                               | road crossings (most are 2 to 4 m wide, so paths and lanes; a few 7 to 10 m)   | 39        |
| `TPS_GREEN_AREAS`                         | green areas crossed                                                            | 4         |
| `TPS_TERRAIN_BG` / `TPS_SECTION_LINE`     | terrain profile, 1,000 samples about 1 m apart                                 | 1,113 / 1 |
| `TPS_TREES_*`                             | trees (Overture + canopy height), about 1,800                                  | 1,798     |
| Names, contours, spot heights, boundaries | **none**                                                                       | 0         |

## What could improve our map

- **Position check (done):** four of five crossed buildings agree with our OSM footprints within about 0.4 m along the line. This is consistent with our positions in the SEECS-to-Masjid corridor, but it is **not independent proof**: the section's buildings come from Overture, which largely imports OSM.
- **One missing structure:** a 3.6 m wide building at 503 to 507 m along the line (about 33.64450, 72.98705) is not in our map. See `docs/proposed-corrections.md`.
- **Terrain:** 16.6 m of rise along the line. Useful as a reality check that the ground is gently sloped, and a future TODO for a terrain layer. A single line cannot make a terrain surface, and the licence status is reference only, so **no terrain layer was built** and no slopes were invented.
- **Heights:** the five height labels (5.1 to 5.8 m) look like Overture's generic estimates (all within a metre of each other, including on a 92 m-wide mosque). They are too weak to override OSM or `heights.ts`.
- **Contours, spot heights, names, boundaries:** none present.
