# Navigation performance: before (commit 21b685a)

Profiled before any navigation change, with `scripts/perf-nav.mjs`: production build (`next start`), headless Chrome,
390x844 at 2x, **4x CPU throttling**, `?simulate=gate1` (GPS fixes at Gate no. 2 with jitter), destination Concordia 1.
Scenarios: idle map (8 s), tapping Navigate and starting (about 7 s), 30 s of navigating, opening and closing the
steps sheet 3 times.

The GPU is **software GL (SwiftShader)**: every 3D frame costs about 100 ms whatever the app does, so the fps here is
not a phone's fps. Main-thread numbers (script, style, layout, long tasks) are the reliable signal.

First profile (14 Nov): `nav-before.json`. Re-run three times on 15 Nov from a build outside OneDrive, alternating
with the "after" build: `runs/before-{1,2,3}.json`. Medians of those three runs:

| Scenario    | Frame median / p95 / max (ms) | Frames > 50 ms | JS per frame (ms) | Main thread busy | Long tasks (max) | Layouts / style recalcs | Draw calls |
| ----------- | ----------------------------- | -------------- | ----------------- | ---------------- | ---------------- | ----------------------- | ---------- |
| Idle        | 16.8 / 116.7 / 133            | 58             | 2.37              | 14.7 %           | 0                | 69 / 66                 | 48         |
| Start       | 116.6 / 200 / 417             | 47             | 18.47             | 36.8 %           | 11 (419 ms)      | 58 / 58                 | 58.5       |
| Navigating  | 66.8 / 150 / 333              | 209            | 5.88              | 15.7 %           | 0                | 216 / 205               | 59         |
| Steps sheet | 99.9 / 166.6 / 183            | 51             | 7.43              | 49.4 %           | 25 (113 ms)      | 77 / 68                 | 59         |

## Top 5 causes (from the traces in `traces/nav-before-*.json.gz`, kept locally, not in git)

1. **The sheet restyled the whole page on every animation frame.** `BottomSheet` wrote its height to a CSS variable
   (`--sheet-h`) on `<html>`; every element using it, and everything inheriting from `<html>`, was recalculated. Steps
   sheet: 1,573 ms of `UpdateLayoutTree` in 6.5 s, 21 to 26 long tasks, the main thread about half busy.
2. **Every GPS fix went through React.** Each fix set `userPos` in the store: `RoutePanel` recomputed and re-rendered
   the step list, `UserMarker` rebuilt its accuracy-circle geometry, and the store subscription re-armed 1.8 s of
   full-rate rendering. That is the 205 style recalcs and 216 layouts in 30 s of navigating.
3. **Continuous rendering while following.** With `locate === 'follow'` the canvas drew every frame even when the dot
   and camera were still (about 6.5 ms of main thread per frame at 4x throttling, before the GPU).
4. **Camera moves fought each other.** The follow lerp, the eased fly-to tweens and `fitPoints` all wrote the camera.
   `fitPoints` ran again on every reroute, and switching to top-down started its own flight, replacing the
   navigation flight.
5. **Starting directions was one long task.** Fitting the route, building the route line and compiling its shader,
   plus shadows and bloom: a single 384 to 537 ms long task. `LabelLayer` also wrote label positions to the DOM
   20 times a second, even when nothing moved.
