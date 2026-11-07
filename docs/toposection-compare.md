# Toposection vs our map (reference only)

Generated 2026-11-07 by `scripts/toposection-compare.ts`. See `docs/toposection-report.md` for what the file is and its licence status.

## Where the section line is (inferred, NOT stated in the file)

The file has no coordinates. The line was located by matching its building crossings to our footprints (`scripts/toposection-locate.ts`), then refined.

- Start (x = 0): **33.64679, 72.99176** → end (x = 998.4): **33.64227, 72.98244**, heading **239.8° (compass)**
- Fit quality: IoU **0.966** (1.0 = identical). Of 134 m of building the toposection records, the fit reproduces most; our map has 0.0 m of building along the line that the toposection does not.
- Confidence: the match is strong (the next-best unrelated line scores far lower) but it is an **inference**. A 1-D section cannot prove its own position, and the fit was chosen to maximise agreement with OUR footprints, so it cannot reveal a shift _across_ the line.

## What can and cannot be measured

A section only records where the line crosses things. So we can compare **along-line positions** (edge positions of buildings, road crossings, green areas). We **cannot** measure sideways shifts, building shapes, or a global X/Y offset, and **no systematic shift can be claimed from this file**. Control points (`data/control-points.csv`) remain the only way to verify absolute position.

Also: the toposection's buildings and roads come from **Overture Maps**, not surveyed ground truth. Where it disagrees with OSM, either could be wrong.

## Buildings (5 observed crossings)

| #   | Toposection (m along line) | Our building on the same line                           | Offset enter / exit (m) | Toposection height label | Our resolved height (m) |
| --- | -------------------------- | ------------------------------------------------------- | ----------------------- | ------------------------ | ----------------------- |
| 1   | 345.1–350.7 (5.6 m)        | NUST Ibrahim Mess (`way/208959445`) 345.3–351.3 (6.0 m) | +0.1 / +0.5             | +5.81                    | 5.0                     |
| 2   | 374.6–398.4 (23.8 m)       | IGIS (`way/1253900709`) 375.3–398.5 (23.3 m)            | +0.7 / +0.1             | +5.41                    | 12.0                    |
| 3   | 503.2–506.8                | none within 8 m                                         | –                       | –                        | –                       |
| 4   | 515.7–524.7 (9.0 m)        | RIMMS (`way/209668231`) 516.0–525.0 (9.0 m)             | +0.3 / +0.3             | +5.07                    | 12.0                    |
| 5   | 573.2–665.3 (92.1 m)       | Masjid-e-Rehmat (`way/208960114`) 573.5–665.5 (92.0 m)  | +0.3 / +0.2             | +5.65                    | 10.0                    |

Along-line edge offsets: mean 0.3 m, max |0.7| m; RMS 0.4 m. Mean signed offset 0.3 m (not evidence of a systematic shift: see above).

Our buildings on the line that the toposection does **not** list (0):
_none_

## Roads

Toposection road crossings: 39. Our vehicular road crossings on the same line: 14 (footpaths excluded).
Matched within 15 m: **30 / 39** (mean 0.0 m, max |9.2| m along-line offset). Our roads with no toposection counterpart: 0.

## Green areas

Toposection: 4 intervals (0–6, 201–258, 214–219, 293–296). Ours: 2 intervals (0–8, 294–297).

## Elevation

Terrain along the line: **546.1 m to 562.7 m**, 1.66 % average rise from x = 0 to x = 998.4. This is the 30 m global DTM, so it shows the broad slope only, not small features. Our map is flat; see the TODO in the report.

## Overlays

- `docs/compare/overlay.svg`: plan view, section line and crossings over our footprints and roads.
- `docs/compare/profile.svg`: along-line strip comparing buildings, roads and terrain.
