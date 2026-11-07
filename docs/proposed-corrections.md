# Proposed corrections (from the toposection, reference only)

Nothing here has been applied. `landmarks.ts`, `heights.ts` and the geojson are unchanged. Evidence is from `docs/toposection-compare.md`.

## Applied offsets

**None.** `GLOBAL_OFFSET` stays off. Four of five building crossings agree with our footprints within 0.4 m along the line, and a 1-D section cannot measure a sideways or global shift anyway. Only `data/control-points.csv` can justify an offset.

## Proposals

| #   | Proposal                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                           | Confidence                                                                                                            | How to verify                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Add a small building** (3.6 m along the line) near **33.64450, 72.98705** (between the Ibrahim Mess/IGIS corridor and RIMMS, 503 to 507 m along the section). It exists in Overture but not in our OSM export. | Toposection `TPS_BUILDINGS` crossing 503.2 to 506.8 m with label +5.82 m; our footprints have nothing within 8 m.                                                                                                                  | Medium. Could be a kiosk, booth or shed, or an Overture artefact.                                                     | Look at the spot on site or satellite imagery you are allowed to use; if real, map it in OSM and run `npm run refresh-data -- --apply`. |
| 2   | **Review heights** of IGIS (our 12.0 m, category default), RIMMS (12.0 m default) and Masjid-e-Rehmat (10.0 m default): toposection labels say 5.4 / 5.1 / 5.7 m.                                                | Labels from `TPS_BUILDING_HEIGHTS_TEXT`.                                                                                                                                                                                           | **Low.** All five labels sit between 5.07 and 5.82 m, including a 92 m-wide mosque, which suggests generic estimates. | Count floors on site and put the value in `src/data/heights.ts` with a `source`. Do not copy the toposection number.                    |
| 3   | No change to roads or green areas.                                                                                                                                                                               | 30 of 39 toposection road crossings fall within 15 m of one of our vehicular crossings; most of the rest are 2 to 4 m wide, which are paths and lanes. Offsets scatter evenly (about ±9 m) so that is matching noise, not a shift. | n/a                                                                                                                   | n/a                                                                                                                                     |

## Things this file cannot tell us

- Absolute position error of the whole map (needs control points).
- Building shapes, entrances, names, or anything off the line.
- Real heights.

---

# From topoexport-9CF709 and topoexport-18D98C (reference only)

Evidence: `docs/topo-compare.md`. Nothing applied. Both exports are Overture-derived, and Overture's buildings are largely imported from OSM, so **agreement with us is expected and is not independent verification**. Only disagreement is informative.

## Applied offsets

**None.** With a fitted rotation of 1.10° to 1.15° (UTM grid convergence), the matched same-size buildings agree with our footprints to a median 0.7 to 0.9 m, and the mean shift is under 0.5 m, well inside the scatter. That shows our footprints match Overture/OSM, not that either matches the ground. `GLOBAL_OFFSET` stays off; only `data/control-points.csv` can justify an offset.

## Position differences over 3 m (same-size buildings)

| Building           | Our id           | Offset                 | Note                                                                                                                                             |
| ------------------ | ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ghazali 2          | `way/209091616`  | 11.3 m N (9CF709 only) | Footprint area ratio 1.14. Not seen in 18D98C, so a local difference between Overture releases or a clipped footprint. Check the outline in OSM. |
| Rumi I             | `way/209832802`  | 10.5 m W (18D98C only) | Area ratio 0.90. Same kind of difference; check OSM outline.                                                                                     |
| Swimming Pool Area | `way/1159186156` | 3.9 m SE (18D98C only) | Close to noise. No action.                                                                                                                       |

Another 22 (9CF709) and 12 (18D98C) matched buildings differ by large centroid distances but have very different areas (Razi Hostel, NUST Business School, NIT, NICE, Ghazali 2): these are **merge/split differences** (Overture has several small parts where OSM has one multipolygon, or the reverse), not position errors. No action unless you want those complexes re-outlined.

## Possible buildings missing from our map (unverified)

Overture lists these footprints (over 100 m², all labelled with the 6.0 m default height) where we have nothing. Some may be sheds, staff quarters, temporary structures or Overture artefacts. **Not added to anything.** Check on site or on imagery you may use, and map real ones in OSM, then `npm run refresh-data -- --apply`.

| Location (lat, lng) | Area     | Nearest of our buildings                                               |
| ------------------- | -------- | ---------------------------------------------------------------------- |
| 33.64148, 72.99451  | 2,613 m² | 33 m (large; might be a ground, pavilion or covered area, check first) |
| 33.64363, 72.99321  | 447 m²   | 13 m                                                                   |
| 33.63861, 72.98372  | 414 m²   | 18 m (south-west corner)                                               |
| 33.64134, 72.98695  | 379 m²   | 36 m                                                                   |
| 33.64128, 72.98486  | 344 m²   | 49 m                                                                   |
| 33.64263, 72.98953  | 344 m²   | 36 m                                                                   |
| 33.64197, 72.99347  | 341 m²   | 26 m                                                                   |
| 33.64116, 72.98496  | 333 m²   | 35 m                                                                   |
| 33.64124, 72.98677  | 265 m²   | 35 m                                                                   |

The full list (41 footprints over 100 m² across both exports) can be regenerated with `npm run topo`.

## Height differences (topo label vs ours)

94% of topo heights are the 6.0 m default, so only non-default labels carry any information, and even those are Overture's estimates (OSM tags or ML), not measurements.

| Building                                                         | Topo | Ours   | Comment                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEECS UG / PG / Faculty Blocks                                   | 30 m | 10.2 m | Large gap (about 9 floors vs our 3). Both datasets say 30 m. Our 10.2 m is 3 × 3.4 m from a default or tag, not a counted value. **Please count floors on site** and enter in `heights.ts` with a source. |
| NUST School of Health Sciences (`way/1150520234`)                | 30 m | 3.4 m  | Same: a 30 m label next to our single floor looks wrong either way; check.                                                                                                                                |
| Admin Office, hostels (Ayesha, Zakariya, Hajveri, Khadija), SADA | 12 m | 13.6 m | Within 1.6 m. No action.                                                                                                                                                                                  |
| NUST Main Office                                                 | 16 m | 16.0 m | Equal (ours is in `heights.ts`). Consistent.                                                                                                                                                              |
| ASAB Greenhouse                                                  | 5 m  | 5.0 m  | Equal.                                                                                                                                                                                                    |

Do not copy the topo numbers into `heights.ts`. Use them only as a prompt to count floors.

## Elevation

Terrain is 539 to 582 m (30 m EDTM). Our map is flat; no slopes were invented. A terrain layer was **not built**: the exports are reference only, and 30 m cells cannot make a believable campus surface anyway.
