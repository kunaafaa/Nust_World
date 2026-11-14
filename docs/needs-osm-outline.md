# Hostels and areas that need an OSM outline

Generated 2026-11-14. Hostel **areas** are never extruded: every hostel area polygon is drawn only as a faint dashed
boundary on the ground, with no fill and no height. Real building outlines come from OSM or, where the attribution
covers it, from Overture (topo merge). Trace the real outlines in OSM (`building=dormitory` or `building=yes` +
`name=…`) and re-export.

- Attar Hostel (area way/209090692): 1 hostel outline(s) mapped inside; other hostels in this area may be unmapped
- Ghazali Hostel (area way/209091615): 2 hostel outline(s) mapped inside; other hostels in this area may be unmapped
- Razi Hostel Area (area way/209855481): no OSM building outline inside; area drawn as a dashed boundary

### Template-based, approximate: Rehmat Hostel and Razi 1 (inside Razi Hostel Area, way/209855481)

Neither hostel has a building outline in OSM. Until someone traces them, each is drawn with an **exact copy of a Ghazali
footprint** (no scaling, no simplification), rotated and placed by `data/hostel-placement.ts`. The shape, the position
and the entrance side are **approximate**. The centroid below is where the copy sits in the app, not a survey.

| Hostel        | Template                      | Centroid in the app (lat, lng) | Placement                                | Fit             |
| ------------- | ----------------------------- | ------------------------------ | ---------------------------------------- | --------------- |
| Rehmat Hostel | Ghazali 1 (OSM way/209090803) | **33.63999, 72.98660**         | -94° · mirror false · offset 4.7, 13.7 m | inside the area |
| Razi 1        | Ghazali 2 (OSM way/209091616) | **33.63952, 72.98678**         | 85° · mirror false · offset 0, 0 m       | inside the area |

- The one Overture outline in the area (`overture/a84586b2-ff5a-427d-9146-b3851e58ff82`, 1,704 m², Microsoft ML
  Buildings, about 33.64010, 72.98655, next to Rehmat Hostel Parking) is **not drawn** any more; its centroid is
  Rehmat's position anchor. It is probably the real Rehmat Hostel: a good starting point for tracing it in OSM.
- To trace: map each building in OSM with `building=dormitory` + `name=Rehmat Hostel` / `name=Razi 1`, re-export,
  then delete its entry from `data/hostel-placement.ts`.

## Buildings added from Overture (not in OSM): please map them

Overture release 2026-10-21.0. These are drawn as **provisional** (dashed outline, default height, unnamed). They are ML-derived outlines, **not verified**: check each on site or on imagery you may use, then trace the real ones in OSM. Added outlines have no name; only hostel outlines inside a named OSM hostel area or around a named OSM point carry that name (never guessed).

| #   | Location (lat, lng) | Area   | Upstream               | Confidence |
| --- | ------------------- | ------ | ---------------------- | ---------- |
| 1   | 33.64183, 72.98441  | 114 m² | Microsoft ML Buildings | low        |
| 2   | 33.63991, 72.98305  | 122 m² | Microsoft ML Buildings | low        |
| 3   | 33.63993, 72.98318  | 166 m² | Microsoft ML Buildings | low        |
| 4   | 33.64065, 72.99046  | 182 m² | Microsoft ML Buildings | low        |
| 5   | 33.63871, 72.99164  | 176 m² | Microsoft ML Buildings | low        |
| 6   | 33.64686, 72.99336  | 164 m² | Microsoft ML Buildings | low        |
| 7   | 33.64659, 72.99382  | 116 m² | Microsoft ML Buildings | low        |
| 8   | 33.64645, 72.99357  | 155 m² | Microsoft ML Buildings | low        |
| 9   | 33.64663, 72.99362  | 125 m² | Microsoft ML Buildings | low        |
| 10  | 33.64699, 72.99358  | 154 m² | Microsoft ML Buildings | low        |
| 11  | 33.64295, 72.99353  | 168 m² | Microsoft ML Buildings | low        |
| 12  | 33.64306, 72.99340  | 118 m² | Microsoft ML Buildings | low        |
| 13  | 33.64363, 72.99321  | 447 m² | Microsoft ML Buildings | medium     |
| 14  | 33.64508, 72.99282  | 120 m² | Microsoft ML Buildings | low        |
| 15  | 33.64262, 72.98953  | 344 m² | Microsoft ML Buildings | medium     |
| 16  | 33.64842, 72.99114  | 108 m² | Microsoft ML Buildings | low        |

Hostel outlines from Overture: 1 (Razi Hostel). Outlines inside Razi Hostel Area are not drawn: the template placement above is used there.

Left out by the override list (Google Open Buildings): 27 outlines (23 additions, 4 hostel footprints). Under 100 m² without an OSM counterpart: 130, not added.
