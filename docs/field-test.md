# Field test checklist

Do this on a real phone, outdoors on campus, with the deployed (HTTPS) site. Geolocation only works on HTTPS or localhost.
Test on at least one Android (Chrome) and one iPhone (Safari). Note the phone model, browser, and time of day in each report.

## 0. Before you leave

- [ ] Open the site on mobile data, wait for it to load, then enable airplane mode and reload: the map should still work (offline cache).
- [ ] Turn airplane mode off. Add to Home Screen (Chrome menu / Safari Share): the icon and name should be "NUST World".

## 1. Location basics (stand still at a gate)

- [ ] Tap the target button (bottom right). The browser asks for location. Allow.
- [ ] A blue dot appears and the camera moves to you. The pale blue circle is your GPS accuracy in true metres: note its radius.
- [ ] The dot is within a few metres of where you are actually standing. **Record the offset and direction** (e.g. "dot is ~6 m north-east of the real gate"). Do this at 3+ places (see section 4).
- [ ] Tap the target again: it turns solid blue (follow mode). Walk 30 m: the map follows. Drag the map: follow stops (button goes back to outline).
- [ ] iPhone: rotate the phone. A heading cone appears (iOS asks for motion permission on the first tap). Android: the cone appears after you move or turn.

## 2. Walking and directions

- [ ] Pick a destination, tap Navigate, set From = "My location". The route and steps appear.
- [ ] Walk the route. The dot stays near the path (it snaps to a footpath only when accuracy is under 25 m and the path is within 15 m).
- [ ] Deliberately walk 40 m the wrong way: after about 3 s it says "Rerouting…" and the route restarts from you.
- [ ] Walk to the destination: within 15 m you get "You have arrived" (and a buzz if the phone supports it).
- [ ] Quick buttons (Food / Masjid / Gate / ATM) route you to the nearest one.

## 3. Failure cases

- [ ] Deny the permission: a friendly message appears and the rest of the map still works (pick a gate to start from).
- [ ] Stand inside a building or basement: weak-GPS message appears when accuracy is worse than 50 m.
- [ ] Switch to another app for a minute and come back: tracking resumes (it pauses while hidden to save battery).
- [ ] Open the site away from campus (home): "You don't seem to be on campus" and no blue dot.

## 4. Control points (this is what fixes the map accuracy)

Stand exactly at 10 or more clearly identifiable spots: building corners, gate posts, the centre of roundabouts.
Use a GPS app (e.g. GPS Test, Google Maps long-press shows coordinates) and wait for accuracy under 5 m. Record:

```csv
label,survey_lat,survey_lng,osm_id
Gate 1 left post,33.6xxxxx,72.9xxxxx,
SEECS UG block NE corner,33.6xxxxx,72.9xxxxx,way/661630148
```

Save as `data/control-points.csv`, then run `npm run control-points`. It writes `docs/control-point-report.md`:

- A mean shift under 3 m: no action. (Phone GPS error under 5 m is noise, not a map error.)
- A mean shift above 3 m in a consistent direction: the report prints the exact `GLOBAL_OFFSET` values for `src/lib/config.ts`.
  It is **off by default**; turn it on only if the report says so.

## 5. Simulate without going outside

- `?simulate=gate1` pretends you are standing at a gate (Gate 1 if mapped, otherwise the first gate found; with realistic jitter). Tap the target button to see the dot, accuracy circle, nearest-place buttons and rerouting.
- `?debug=1` shows the routing graph, footprints, building ids, FPS, draw calls, and the lat/lng + scene x/z under the cursor.
- `?flat=1` forces the 2D fallback map (what people without WebGL see).

## 6. What to send back

Phone model, browser, the section-1 offsets, anything from sections 2 and 3 that did not behave, and `data/control-points.csv`.
