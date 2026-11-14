# Hostels and areas that need an OSM outline

Updated 2026-11-15. Hostel **areas** are no longer extruded: every hostel area polygon (Razi, Ghazali, Attar, Rumi,
Fatima, Rumi hostels) is drawn only as a faint dashed boundary on the ground, with no fill and no height. Real building
outlines come from OSM or, where the attribution covers it, from Overture (topo merge). Nothing is drawn from label
positions. Trace the real outlines in OSM (`building=dormitory` or `building=yes` + `name=…`) and re-export.

- Attar Hostel (area way/209090692): 1 hostel outline(s) mapped inside; other hostels in this area may be unmapped
- Ghazali Hostel (area way/209091615): 2 hostel outline(s) mapped inside; other hostels in this area may be unmapped
- Razi Hostel Area (area way/209855481, centroid **33.63998, 72.98663**): no OSM building outline.

### Rehmat Hostel and Razi 1 (inside Razi Hostel Area)

| Hostel        | OSM outline | Overture outline                                                                      | Shown in the app                    |
| ------------- | ----------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| Rehmat Hostel | none        | see below                                                                             | searchable; lands on the area place |
| Razi 1        | none        | none allowed (the other outlines here come only from Google Open Buildings, excluded) | searchable; lands on the area place |

- One Overture outline exists in the area: `overture/a84586b2-ff5a-427d-9146-b3851e58ff82`, **1,704 m²**, upstream
  Microsoft ML Buildings (ODbL), centroid about 33.64010, 72.98655. It is extruded exactly as given (4 floors x 3.0 m).
- It is **left unnamed**: it sits 1.1 m from "Rehmat Hostel Parking" (way/1481128908) and 5.6 m from "Rahmat Sidewalk"
  (way/1256471914), so it is probably Rehmat, but nothing in the data says so. Please confirm, then map it in OSM with
  `name=Rehmat Hostel`.
- Razi 1 has no outline from any allowed source. Map it in OSM.
- No landmarks.ts entries exist for either hostel (there is no OSM object to give them an osmId).

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

Hostel outlines from Overture: 1 (Razi Hostel Area, 1,704 m², Microsoft ML Buildings). The group is incomplete: the
other outlines in that area come only from Google Open Buildings and stay excluded. With the provisional block gone, a
partial set no longer hides anything, so the one allowed outline is drawn.

Left out by the override list (Google Open Buildings): 27 outlines (23 additions, 4 hostel footprints). Under 100 m² without an OSM counterpart: 130, not added.
