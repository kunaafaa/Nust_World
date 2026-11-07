# Topo data vs our map (reference only)

Generated 2026-11-07 by `scripts/topo-fit.ts` + `scripts/topo-compare.ts`. Dataset descriptions and licence status: `docs/topo-data-report.md`. **All three datasets are reference only**; nothing here feeds the app.

## topoexport-9CF709

### Georeference

- No CRS in the file (DXF local metres, origin at the south-west corner of the export frame, `$INSUNITS` 6 = metres). **Fitted** to our footprints by maximising overlap (the fit is chosen against OUR data, so it can show shape and relative agreement but cannot prove absolute position; for that we need `data/control-points.csv`).
- Frame size 855 × 782 m. Fitted SW corner **33.63835, 72.98297**, NE corner **33.64553, 72.99204**.
- Fitted rotation **1.15°** relative to our tangent plane. This is almost exactly the UTM zone 43 grid convergence at 72.99°E, (72.99−75)×sin 33.64° ≈ −1.1°, so the export is in a **north-up UTM grid** and the rotation is a frame difference, not a map error. Our scene is aligned to true north.
- Fit quality: **85.9%** of the topo building interior (buildings over 150 m²) lies inside one of our footprints.
- Matched 78 of 191 topo buildings to one of ours by centroid/vote.

### Positions (matched buildings with similar area, ratio 0.8–1.25: 52)

- Centroid offset: median **0.7 m**, 90th percentile 1.0 m.
- Mean shift vector topo − ours: **0.18 m east, 0.19 m north** (scatter ±0.5 / ±1.6 m). The mean is well inside the scatter: **no systematic shift detected.**

### Discrepancies over 3 m, same-size buildings (1)

| Feature   | Our id          | Our centroid       | Topo centroid      | Offset | Bearing (our→topo) | Area ratio |
| --------- | --------------- | ------------------ | ------------------ | ------ | ------------------ | ---------- |
| Ghazali 2 | `way/209091616` | 33.64056, 72.98760 | 33.64066, 72.98761 | 11.3 m | 5° N               | 1.14       |

Another 22 matched buildings differ by over 3 m at the centroid but have a different footprint area (ratio outside 0.8–1.25): shape or merge/split differences, not positional errors. Largest: Razi Hostel (62 m, area ×0.00); Razi Hostel (52 m, area ×0.01); Razi Hostel (47 m, area ×0.01); NUST Business School (44 m, area ×0.01); NUST Business School (33 m, area ×0.01); Razi Hostel (31 m, area ×0.02).

### Buildings in one map but not the other

- **In topo, nothing of ours there:** 35 over 60 m². Largest: 33.63883, 72.98374 (1228 m²); 33.63904, 72.98366 (1030 m²); 33.63897, 72.98306 (696 m²); 33.63861, 72.98372 (414 m²); 33.64134, 72.98696 (379 m²); 33.64262, 72.98954 (344 m²); 33.64128, 72.98487 (344 m²); 33.64116, 72.98497 (333 m²)
- **In ours, nothing in topo (inside its frame):** 0.

### Building heights (topo label vs our resolved height)

- Label distribution over all 191 topo buildings: 6 m ×180, 12 m ×4, 27 m ×1, 30 m ×3, 39 m ×1, ? m ×2. **94% are exactly 6.0 m**, which is a default fill (Overture records no height for most buildings), not a measurement.
- Matched buildings whose topo height is not the 6.0 default: 7.

| Building                              | Topo height | Our height | Our source                |
| ------------------------------------- | ----------- | ---------- | ------------------------- |
| Admin Office (`way/387676863`)        | 12 m        | 13.6 m     | landmarks / OSM / default |
| SEECS PG Block (`way/661630147`)      | 30 m        | 10.2 m     | landmarks / OSM / default |
| SEECS Faculty Block (`way/209836754`) | 30 m        | 10.2 m     | landmarks / OSM / default |
| SEECS UG Block (`way/661630148`)      | 30 m        | 10.2 m     | landmarks / OSM / default |
| Zakariya Hostel (`relation/16448909`) | 12 m        | 13.6 m     | landmarks / OSM / default |
| Hajveri Hostel (`relation/16448908`)  | 12 m        | 13.6 m     | landmarks / OSM / default |
| Hajveri Hostel (`relation/16448908`)  | 12 m        | 13.6 m     | landmarks / OSM / default |

### Elevation

- Terrain mesh: 1763 vertices, **538.5–563.3 m**. Contours: 12 polylines at 5 m intervals (540, 545, 550, 555, 560 m).
- Source (per LICENSE.txt): OpenGeoHub EDTM, **30 m** cells, CC BY 4.0. A 30 m model cannot resolve single buildings or small mounds; it shows the broad fall across the campus only.

## topoexport-18D98C

### Georeference

- No CRS in the file (DXF local metres, origin at the south-west corner of the export frame, `$INSUNITS` 6 = metres). **Fitted** to our footprints by maximising overlap (the fit is chosen against OUR data, so it can show shape and relative agreement but cannot prove absolute position; for that we need `data/control-points.csv`).
- Frame size 1049 × 953 m. Fitted SW corner **33.64077, 72.98442**, NE corner **33.64952, 72.99555**.
- Fitted rotation **1.10°** relative to our tangent plane. This is almost exactly the UTM zone 43 grid convergence at 72.99°E, (72.99−75)×sin 33.64° ≈ −1.1°, so the export is in a **north-up UTM grid** and the rotation is a frame difference, not a map error. Our scene is aligned to true north.
- Fit quality: **89.4%** of the topo building interior (buildings over 150 m²) lies inside one of our footprints.
- Matched 87 of 217 topo buildings to one of ours by centroid/vote.

### Positions (matched buildings with similar area, ratio 0.8–1.25: 73)

- Centroid offset: median **0.9 m**, 90th percentile 1.5 m.
- Mean shift vector topo − ours: **0.03 m east, -0.42 m north** (scatter ±1.4 / ±0.7 m). The mean is well inside the scatter: **no systematic shift detected.**

### Discrepancies over 3 m, same-size buildings (2)

| Feature            | Our id           | Our centroid       | Topo centroid      | Offset | Bearing (our→topo) | Area ratio |
| ------------------ | ---------------- | ------------------ | ------------------ | ------ | ------------------ | ---------- |
| Rumi I             | `way/209832802`  | 33.64578, 72.99190 | 33.64577, 72.99179 | 10.5 m | 266° W             | 0.90       |
| Swimming Pool Area | `way/1159186156` | 33.64118, 72.99399 | 33.64115, 72.99401 | 3.9 m  | 148° SE            | 0.97       |

Another 12 matched buildings differ by over 3 m at the centroid but have a different footprint area (ratio outside 0.8–1.25): shape or merge/split differences, not positional errors. Largest: NIT (44 m, area ×0.04); NUST Business School (44 m, area ×0.01); Ghazali 2 (34 m, area ×0.13); NUST Business School (33 m, area ×0.01); NICE (30 m, area ×0.35); NUST Business School (26 m, area ×0.01).

### Buildings in one map but not the other

- **In topo, nothing of ours there:** 43 over 60 m². Largest: 33.64148, 72.99451 (2613 m²); 33.64363, 72.99321 (447 m²); 33.64134, 72.98695 (379 m²); 33.64263, 72.98953 (344 m²); 33.64128, 72.98486 (344 m²); 33.64197, 72.99347 (341 m²); 33.64116, 72.98496 (333 m²); 33.64124, 72.98677 (265 m²)
- **In ours, nothing in topo (inside its frame):** 2. Rumi II, way/1213450036

### Building heights (topo label vs our resolved height)

- Label distribution over all 217 topo buildings: 2 m ×1, 5 m ×1, 6 m ×204, 12 m ×5, 16 m ×1, 30 m ×4, ? m ×1. **94% are exactly 6.0 m**, which is a default fill (Overture records no height for most buildings), not a measurement.
- Matched buildings whose topo height is not the 6.0 default: 11.

| Building                                          | Topo height | Our height | Our source                |
| ------------------------------------------------- | ----------- | ---------- | ------------------------- |
| SADA (`way/738027653`)                            | 12 m        | 13.6 m     | landmarks / OSM / default |
| Nust School of Health Sciences (`way/1150520234`) | 30 m        | 3.4 m      | landmarks / OSM / default |
| ASAB Greenhouse (`way/1213411464`)                | 5 m         | 5.0 m      | landmarks / OSM / default |
| Admin Office (`way/387676863`)                    | 12 m        | 13.6 m     | landmarks / OSM / default |
| Ayesha Hostel (`relation/16442296`)               | 12 m        | 13.6 m     | landmarks / OSM / default |
| Ayesha Hostel (`relation/16442296`)               | 12 m        | 13.6 m     | landmarks / OSM / default |
| SEECS PG Block (`way/661630147`)                  | 30 m        | 10.2 m     | landmarks / OSM / default |
| SEECS Faculty Block (`way/209836754`)             | 30 m        | 10.2 m     | landmarks / OSM / default |
| Khadija Hostel (`way/1152594118`)                 | 12 m        | 13.6 m     | landmarks / OSM / default |
| NUST Main Office (`way/209141896`)                | 16 m        | 16.0 m     | heights.ts                |
| SEECS UG Block (`way/661630148`)                  | 30 m        | 10.2 m     | landmarks / OSM / default |

### Elevation

- Terrain mesh: 2650 vertices, **539.3–581.6 m**. Contours: 18 polylines at 5 m intervals (540, 545, 550, 555, 560, 565, 570, 575, 580 m).
- Source (per LICENSE.txt): OpenGeoHub EDTM, **30 m** cells, CC BY 4.0. A 30 m model cannot resolve single buildings or small mounds; it shows the broad fall across the campus only.

## The two exports against each other

- Overlap: both frames sit over the same campus; B (1049 × 953 m) is larger than A (855 × 782 m) and extends further north and east. Same source stack (Overture + EDTM + canopy), so they are **complementary views of the same data, not independent confirmation**.
- Buildings paired by position and size: 90; centroid separation median **0.82 m**, max 1.2 m (both fitted separately to our map, so this also measures the fit repeatability).
- Height labels that differ between the two for the same building: 0 of 89.
- Terrain at shared locations (A − B, 346 samples): mean 0.27 m, worst 6.7 m.
- Note the two exports are in **different local frames** (each starts at its own SW corner), so A's coordinates cannot be read as B's without the fits above.
