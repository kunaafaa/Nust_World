# Progress

Last updated 2026-11-15.

## Overnight run (2026-11-15): resume here

| Phase                            | Status           | Commit(s) | Notes                                                                                                   |
| -------------------------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| 0A Navigation mode               | **Done**         | 021cd1e   | Gate green: lint, typecheck, 117 unit, build, 51/51 e2e (nav spec 27/27 over 3 repeats).                |
| 4 Clean perf comparison          | **Done** (early) | c53d5cc   | Ran outside OneDrive, 3 alternating runs per build. Temp worktrees removed. `docs/perf/nav-after.md`.   |
| 0A+ Camera gesture fixes         | **Done**         | 73cc409   | Found by the e2e suite: pinch dropped after a flight, late first-fix recentre, slow flights at low fps. |
| 0B Razi/Rehmat reuse Ghazali     | **Done**         | 74dd737   | `data/hostel-placement.ts`; Rehmat = Ghazali 1, Razi 1 = Ghazali 2; 127 unit, 56/56 e2e.                |
| 1 Reviews and food ratings       | **Done**         | 4 commits | Off by default. 177 unit (RLS in pglite), 65/65 e2e. Setup: `docs/REVIEWS_SETUP.md`. First load +2 KB.  |
| 2 Security hardening             | **Done**         | see below | Findings and status: `docs/SECURITY_REVIEW.md`. Gate: lint, typecheck, unit, build, full e2e.           |
| 3 Cleanup and readability        | **Postponed**    |           | Until after the Supabase setup and the review popup work. Nothing was moved or deleted.                 |
| Final gate + OVERNIGHT_REPORT.md | **Postponed**    |           | Same: after Supabase and the review popup.                                                              |

Blockers: none. Things that need the owner are in `docs/NEEDS_FROM_ME.md` (Supabase project and allowed email
domains, for reviews; `NEXT_PUBLIC_DEV_TOOLS=0` once field testing is over).

### Phase 2 summary

Nonce CSP + security headers (`src/proxy.ts`, `src/lib/security/headers.ts`), e2e fails on any CSP violation
(`e2e/fixtures.ts`); one URL parser with allow-lists and `NEXT_PUBLIC_DEV_TOOLS` (`src/lib/urlParams.ts`); secret
scan of the tree and full history + `npm run check-secrets`; `npm audit fix` (non-breaking), CI and Dependabot;
service worker v5; safe storage; privacy e2e test; analytics URL sanitising; client payload checks and write budget;
reviews error boundary; `SECURITY.md`. Open and accepted: xmldom advisories via the dev-only `osmtogeojson`,
`style-src 'unsafe-inline'`, `/` rendered per request.

### Phase 3 notes (for when it resumes)

- `e2e/reviews.spec.ts` and `e2e/menu.spec.ts` both define `settle()` and the sheet-snap helpers; move them into one
  shared e2e helper (`e2e/fixtures.ts` now exists).
- Files over about 300 lines: `Extras.tsx` (613, seven components: natural split), `campus.ts` (630, mostly one
  `buildCampus` function), `CameraRig.tsx` (509, one component), `scatter.ts`, `ReviewsSection.tsx`, `InfoCard.tsx`,
  `topoMerge.ts`, `useLocation.ts`, `RoutePanel.tsx`, `routing.ts`, `Markers.tsx`, `Cars.tsx`, `Buildings.tsx`.
- No `any` and no commented-out code found in `src`, `scripts`, `tests` or `e2e`.
- `three-stdlib` is imported (types, `CameraRig.tsx`) but not declared in `package.json`: declare it rather than rely
  on drei's copy.
- `npm run format` / `prettier --check .` still reports 23 files (mostly generated data JSON and geojson); decide
  between formatting them and adding them to `.prettierignore` before adding a Prettier step to CI.

### Removal candidates (NOT removed; each needs the triple check before anything is deleted)

| Candidate                                                                                                                  | Why it looks unused                                                                                                            | Caution                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `scripts/bundle-size.cjs`                                                                                                  | No npm script and no reference anywhere in the repo.                                                                           | May be run by hand to measure the bundle (README quotes bundle sizes).                  |
| `scripts/fetch-context-roads.ts`                                                                                           | No npm script; mentioned only in `docs/known-issues.md`.                                                                       | It produced `public/data/context-roads.json`; it is the only way to refresh that file.  |
| npm scripts `topo`, `toposection` (and `scripts/topo-*.ts`, `scripts/toposection-*.ts`)                                    | They read `/reference`, which is git-ignored, so they cannot run on a fresh clone.                                             | They work on the owner's machine; the reports in `docs/` come from them.                |
| `scripts/.toposection-candidates.json`, `docs/.topo-fit.json`, `docs/.toposection-fit.json`, `docs/.topo-merge-stats.json` | Generated intermediate outputs.                                                                                                | All are read by scripts (`topo-compare`, `toposection-compare`, `audit`, `topo-merge`). |
| `docs/compare/**` before/after screenshots                                                                                 | Large and regenerated by the e2e and screenshot scripts.                                                                       | Docs are on the never-delete list; consider `.gitignore` for regenerated ones instead.  |
| Local untracked outputs: `test-results/`, `tsconfig.tsbuildinfo`, `.next/dev/`                                             | Build and test outputs.                                                                                                        | Already git-ignored; safe to clear locally, nothing in git.                             |
| npm dependencies                                                                                                           | None found unused: every runtime dependency is imported; `postprocessing` is a required peer of `@react-three/postprocessing`. | n/a                                                                                     |

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

## Cafe menus in the place card (2026-11-14)

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Done               | Menus for C1 (216 items), C2 (112), C3 (129) read from nustcafe.vercel.app's public menu chunks (no API, no login) into `data/menus/*.json`; all 9 site cafes saved. `npm run menus` refreshes them (API first, page second). Landmarks C1/C2/C3 got `menuId` + aliases. Menu section in the place card: pill at peek, sticky chips and category headers, search (more than 25 items), "Menu coming soon" for other food places. Dynamic import per cafe, idle warm-up so the service worker caches the chunks, SW cache `v4-menus`. |
| Tests              | 100 vitest tests (28 new: menu parser, price format, filter, landmark links, sheet snap maths in `tests/sheet.test.ts`); 11 Playwright tests in `e2e/` (3 viewports, touch targets, font sizes, chip jump, search, no-menu cards, 3 visual baselines).                                                                                                                                                                                                                                                                               |
| Docs               | `docs/menu-notes.md` (generated), README "Cafe menus", screenshots in `docs/compare/menu/`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Found, not changed | First-visit tip overlay (`Extras.tsx` Onboarding), seen while testing landscape: (1) it dismisses with one tap on Skip and the card stays usable, so it does not trap the user; (2) in the side-panel layout it sits on top of the card, because `sheetPx` is 0 there and the tip only hides when it is above 0; (3) the Skip target is 28x32 px, under 44; (4) the "Next" button has no click handler, so only Skip moves past the tips. The menu screenshots set `nw-onboarded=1` instead of touching app code.                    |
| Sheet tests        | Done: `snapOffsets` and `chooseSnap` (portrait, small phone, side panel, safe-area, flick, close rules). Still not covered: drag gestures and the content-pull-down handoff in `BottomSheet` (needs a browser; the e2e suite only taps and drags the handle).                                                                                                                                                                                                                                                                        |
