# Navigation performance: after ("Navigation mode: follow, free look, smoother mobile")

Same profile as `nav-before.md` (`scripts/perf-nav.mjs`, 390x844 at 2x, 4x CPU throttling, SwiftShader software
GL, `?simulate=gate1`, destination Concordia 1). Both builds were made outside OneDrive and served side by side
(`next start` on two ports). Runs alternated before, after, before, after, before, after: `runs/*.json`.

Builds: "before" is commit 21b685a, "after" is the navigation work (committed as 021cd1e, apart from one later
CameraRig fix that only affects touches during a camera flight). Both were git worktrees in
`%LOCALAPPDATA%\Temp\nwperf` (outside OneDrive), with `node_modules` copied from the main checkout instead of a fresh
`npm ci` (same lockfile). They were deleted afterwards. **No `walk=1`**: the "before" build has no walking simulator,
so both builds used the same stationary GPS with jitter, as in the original `nav-before.json`. The navigating
scenario therefore measures fix handling and the follow camera, not a moving dot.

An earlier "after" run (14 Nov) is discarded: the machine was busy (an empty `requestAnimationFrame` loop ran 38x
slower than in the "before" run), so it measured the machine, not the app. Run after-1 below was also disturbed
(start phase 22.6 s, 86 long tasks, 627 ms max; the idle phase just before it was normal). It is kept in
`runs/after-1.json` and left out of the medians.

## Before vs after (medians: before runs 1 to 3, after runs 2 and 3)

| Scenario    | Metric                  | Before          | After                                   |
| ----------- | ----------------------- | --------------- | --------------------------------------- |
| Idle        | JS per frame            | 2.37 ms         | 2.15 ms                                 |
|             | Main thread busy        | 14.7 %          | 11.0 %                                  |
|             | Style recalcs in 8 s    | 66              | **0**                                   |
| Start       | Longest task            | 419 ms          | **194 ms**                              |
|             | Long tasks              | 11              | 5                                       |
|             | JS per frame            | 18.5 ms         | 9.1 ms                                  |
|             | Main thread busy        | 36.8 %          | 29.0 %                                  |
| Navigating  | Main thread busy        | 15.7 %          | **9.2 %**                               |
|             | JS per frame            | 5.88 ms         | 4.03 ms                                 |
|             | Layouts / style recalcs | 216 / 205       | **14 / 0**                              |
|             | Longest frame           | 333 ms          | **175 ms**                              |
|             | Frames over 50 ms       | 209             | 194                                     |
|             | Draw calls              | 59              | 50                                      |
| Steps sheet | Main thread busy        | 49.4 %          | **17.6 %**                              |
|             | Long tasks              | 25 (max 113 ms) | **0**                                   |
|             | JS per frame            | 7.43 ms         | 5.07 ms                                 |
|             | Longest frame           | 183 ms          | 182 / 298 ms (one stray frame in run 3) |

## Which fixes mattered

1. **The sheet no longer restyles the page** (`publishSheetHeight` / `subscribeSheetHeight` instead of `--sheet-h`;
   the controls follow it with a `transform`). The steps sheet went from about half the main thread and 25 long
   tasks to 18 % and none. This was the biggest single win.
2. **GPS fixes stay out of React** (`navRuntime`; the store's `userPos` at most once a second; the route line built
   once, with progress and the current step as shader uniforms; the accuracy circle is a scaled unit mesh). While
   navigating, style recalcs went from 205 to 0 and layouts from 216 to 14.
3. **One damped camera controller** and no refit on reroute: no competing camera writes. The longest navigating
   frame halved (333 to 175 ms).
4. **Start split up**: the route is fitted once in the preview; Start is only a short flight. The longest task
   during Start halved (419 to 194 ms).
5. **Lighter rendering while navigating on Medium/Low** (frozen shadow map, no sway or clouds, fewer far trees and
   cars): draw calls 59 to 50. **Render on demand** (`navRuntime.moving`) and `LabelLayer` skipping unchanged ticks
   lower idle cost. In this setup they mostly show as less main-thread time, not more fps.

## The targets: what this machine can and cannot show

- **"50+ fps at 4x throttling on Medium"**: not measurable here. SwiftShader draws the 3D scene on the CPU at about
  100 ms a frame (6 to 7 fps) in **both** builds, idle included, so frame rate is capped by software GL, not by the
  app. Frame medians move between one-vsync and two-vsync modes from run to run (before navigating: 66 ms in two
  runs, 117 ms in one), so they are not a fair comparison here either.
- **"No frame over 50 ms on the sheet"**: not met in this setup, for the same reason: every 3D frame is over 50 ms.
  What the app controls did improve: the sheet no longer causes long tasks (25 to 0), and the main thread is free
  82 % of the time instead of 51 %.
- **Check on a real phone** with `?perf=1` (fps and draw calls overlay) or `?debug=1`: frame rate while following,
  dragging the steps sheet, and pinching during navigation.
