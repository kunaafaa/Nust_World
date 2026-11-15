'use client';
import { useEffect } from 'react';
import { project, unproject } from '@/lib/geo';
import {
  buildSnapIndex,
  maybeSnap,
  nearCampus,
  plausible,
  smooth,
  WEAK_GPS_M,
  type Fix,
  type SnapIndex,
} from '@/lib/location';
import {
  ARRIVE_M,
  cumulative,
  currentStep,
  isNavigating,
  projectOnPath,
  shouldReroute,
} from '@/lib/navMachine';
import { navDispatch } from '@/lib/navController';
import { navRuntime } from '@/lib/navRuntime';
import type { RouteResult } from '@/lib/routing';
import { urlParams } from '@/lib/urlParams';
import { cameraCommands } from '@/scene/CameraRig';
import { useApp } from '@/store/useApp';
import type { Vec2 } from '@/lib/types';

/**
 * Live location controller. Privacy: positions are held in memory only. Nothing is sent to any server,
 * stored, or logged. Module-level state because there is exactly one GPS watch per tab.
 *
 * Performance: fixes are processed at their native rate, but they only write a ref (`navRuntime`); the dot and the
 * camera read it imperatively. React state (`userPos`) is updated at most once a second, for UI that needs it.
 * Problems (permission, weak GPS, off campus) are small chips under the search pill, never popups.
 */
let watchId: number | null = null;
let lastFix: Fix | null = null;
let shown: Vec2 | null = null;
let shownAcc = 50;
let snapIdx: SnapIndex | null = null;
let snapFor: unknown = null;
let wantCentre = false;
let orientationOn = false;
let simTimer: ReturnType<typeof setInterval> | null = null;
let onFirstFix: ((p: Vec2) => void) | null = null;
let lastStoreAt = 0;
let routeFor: RouteResult | null = null;
let routeCum: number[] = [];
let stepAt: number[] = [];

const STORE_EVERY_MS = 1000;
const st = () => useApp.getState();

function ensureSnap() {
  const d = st().data;
  if (!d || snapFor === d) return;
  snapIdx = buildSnapIndex(d.footways.map((f) => f.points));
  snapFor = d;
}

function routeIndex(route: RouteResult) {
  if (routeFor === route) return;
  routeFor = route;
  routeCum = cumulative(route.path);
  stepAt = route.steps.map((s) => {
    const k = route.path.indexOf(s.at);
    return k >= 0 ? routeCum[k] : projectOnPath(route.path, routeCum, s.at).along;
  });
}

/** Nearest gate to a (possibly off-campus) scene position. */
function nearestGate(p: Vec2) {
  const gates = st().data?.places.filter((x) => x.category === 'gate' && !x.offCampus) ?? [];
  let best = gates[0],
    bd = Infinity;
  for (const g of gates) {
    const d = Math.hypot(g.pos[0] - p[0], g.pos[1] - p[1]);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

/** Process a raw fix (from the browser or the simulator). */
export function handleFix(lon: number, lat: number, accuracy: number, t = Date.now()) {
  const s = st();
  if (!nearCampus(lon, lat)) {
    // Never draw the dot off the map. If a route preview is waiting for a start, start from the nearest gate.
    navRuntime.target = null;
    if (s.userPos) s.set({ userPos: null, userAcc: null });
    if (s.navOpen && s.to && !s.from) {
      const g = nearestGate(project(lon, lat));
      if (g) {
        onFirstFix = null;
        s.set({ from: { id: g.id, name: g.shortName, pos: g.entrance ?? g.pos } });
        s.setChip({
          kind: 'offCampus',
          text: `You're not on campus. Starting from ${g.shortName}`,
          action: 'change',
        });
      }
    } else if (!s.chips.some((c) => c.kind === 'offCampus'))
      s.setChip({ kind: 'offCampus', text: "You're not on campus" });
    return;
  }
  const raw = project(lon, lat);
  const fix: Fix = { pos: raw, accuracy, t };
  if (!plausible(lastFix, fix)) return; // ignore teleports (>30 m/s)
  lastFix = fix;
  ensureSnap();
  if (accuracy > WEAK_GPS_M) {
    if (!s.chips.some((c) => c.kind === 'weakGps'))
      s.setChip({ kind: 'weakGps', text: `Weak GPS (±${Math.round(accuracy)} m)`, sticky: true });
  } else if (s.chips.some((c) => c.kind === 'weakGps')) s.setChip(null, 'weakGps');
  if (s.chips.some((c) => c.kind === 'offCampus' && !c.action)) s.setChip(null, 'offCampus');
  if (s.chips.some((c) => c.kind === 'locationOff')) s.setChip(null, 'locationOff');
  const sm = smooth(shown, fix, shownAcc);
  shown = sm;
  shownAcc = accuracy;
  const pos = maybeSnap(snapIdx, sm, accuracy);
  navRuntime.target = pos;
  navRuntime.accuracy = accuracy;

  const now = performance.now();
  if (!s.userPos || now - lastStoreAt >= STORE_EVERY_MS) {
    lastStoreAt = now;
    s.set({ userPos: pos, userAcc: Math.round(accuracy) });
  }

  if (wantCentre) {
    wantCentre = false;
    // From the route preview on, the navigation controller owns the camera: a late first fix must not fly the
    // view (that reset the user's pinch zoom to 170 m when GPS answered after Start).
    if (useApp.getState().nav === 'IDLE') cameraCommands.centerOn(pos[0], pos[1]);
  }
  if (onFirstFix) {
    const cb = onFirstFix;
    onFirstFix = null;
    cb(pos);
  }
  trackRoute(pos, t);
}

/** Progress, current step, arrival and rerouting while navigating. No React state unless the step changes. */
function trackRoute(pos: Vec2, t: number) {
  const s = st();
  const { route, to } = s;
  if (!route || !to || !isNavigating(s.nav)) return;
  routeIndex(route);
  const pr = projectOnPath(route.path, routeCum, pos);
  navRuntime.progressM = pr.along;
  const k = currentStep(stepAt, pr.along);
  navRuntime.stepFromM = stepAt[k - 1] ?? 0;
  navRuntime.stepToM = stepAt[k] ?? routeCum[routeCum.length - 1];
  if (k !== s.navStep) s.set({ navStep: k });
  // the route ends at the (approximate) entrance: arrival counts from there or from the destination itself
  const end = route.path[route.path.length - 1];
  const toDest = Math.min(
    Math.hypot(pos[0] - end[0], pos[1] - end[1]),
    Math.hypot(pos[0] - to.pos[0], pos[1] - to.pos[1]),
  );
  if (toDest <= ARRIVE_M) {
    navDispatch({ type: 'FIX', toDestM: toDest });
    return;
  }
  if (s.from?.name === 'My location' && shouldReroute(pr.off, navRuntime.lastRerouteAt, t)) {
    navRuntime.lastRerouteAt = t;
    s.set({ from: { name: 'My location', pos } }); // the routing worker picks this up
    s.setToast('Rerouting…');
  }
}

function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }) {
  const h =
    typeof e.webkitCompassHeading === 'number'
      ? e.webkitCompassHeading
      : e.alpha != null
        ? (360 - e.alpha) % 360
        : null;
  if (h == null || Number.isNaN(h)) return;
  navRuntime.heading = h;
  // the heading cone is drawn from the ref; React only needs to know a compass exists
  if (st().userHeading == null) st().set({ userHeading: h });
}

async function startOrientation() {
  if (orientationOn || typeof window === 'undefined' || !('DeviceOrientationEvent' in window))
    return;
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try {
    if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted')
      return; // iOS: must come from a tap
  } catch {
    return;
  }
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener, {
    capture: true,
    passive: true,
  });
  window.addEventListener('deviceorientation', onOrientation as EventListener, {
    capture: true,
    passive: true,
  });
  orientationOn = true;
}

function stopOrientation() {
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.removeEventListener('deviceorientation', onOrientation as EventListener, true);
  orientationOn = false;
}

function startWatch() {
  if (watchId != null || simTimer) return;
  const sim = urlParams().simulate;
  if (sim) return startSimulation(sim);
  if (!navigator.geolocation) {
    locationProblem('Location off, tap to enable');
    st().set({ locate: 'off' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (p) => handleFix(p.coords.longitude, p.coords.latitude, p.coords.accuracy, p.timestamp),
    (err) => {
      if (err.code === 1) {
        stopLocation();
        locationProblem('Location off, tap to enable');
      } else locationProblem('Location unavailable, tap to retry');
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
  );
}

/** Location is off or failing: a chip, and if a route is waiting for a start, a second chip to pick one. */
function locationProblem(text: string) {
  const s = st();
  s.setChip({ kind: 'locationOff', text, sticky: true });
  if (s.navOpen && s.to && !s.from)
    s.setChip({ kind: 'pickStart', text: 'Pick a starting point', sticky: true });
}

/**
 * `?simulate=gate1` pretends you are standing at Gate 1 with a little GPS jitter, for testing without leaving home.
 * Add `&walk=1` to walk the active route while navigating (`&walkSpeed=6` m/s for tests, default 1.4).
 * With ?simulate, `window.__nwSim.offset(m)` pushes the simulated walker sideways off the path (reroute tests).
 */
function startSimulation(name: string) {
  const d = st().data;
  const q = urlParams();
  const gates = d?.places.filter((p) => p.category === 'gate') ?? [];
  const num = name.match(/gate(\d+)/i)?.[1];
  const g =
    (num &&
      gates.find((x) =>
        new RegExp(`\\bgate\\s*(no\\.?\\s*)?0?${num}\\b`, 'i').test(x.shortName),
      )) ||
    gates[0];
  if (!g) return;
  const { walk, walkSpeed: speed, simHz: hz } = q;
  const sim = { offset: 0, d: 0, route: null as RouteResult | null, cum: [] as number[] };
  (window as unknown as { __nwSim?: unknown }).__nwSim = {
    offset: (m: number) => {
      sim.offset = m;
    },
  };
  let here: Vec2 = g.pos;
  const tick = () => {
    const s = st();
    if (walk && s.route && isNavigating(s.nav)) {
      if (sim.route !== s.route) {
        sim.route = s.route;
        sim.cum = cumulative(s.route.path);
        sim.d = 0;
      }
      sim.d = Math.min(sim.cum[sim.cum.length - 1], sim.d + speed / hz);
      const path = s.route.path;
      let i = 1;
      while (i < path.length - 1 && sim.cum[i] < sim.d) i++;
      const a = path[i - 1],
        b = path[i];
      const seg = sim.cum[i] - sim.cum[i - 1] || 1;
      const f = Math.min(1, Math.max(0, (sim.d - sim.cum[i - 1]) / seg));
      const nx = -(b[1] - a[1]) / seg,
        nz = (b[0] - a[0]) / seg;
      here = [
        a[0] + (b[0] - a[0]) * f + nx * sim.offset,
        a[1] + (b[1] - a[1]) * f + nz * sim.offset,
      ];
    }
    // Convert back to lon/lat so the full pipeline (bbox check, projection, smoothing) is exercised.
    const [lon, lat] = unproject(here[0], here[1]);
    const j = walk ? 4e-6 : 3e-5;
    handleFix(
      lon + (Math.random() - 0.5) * j,
      lat + (Math.random() - 0.5) * j,
      8 + Math.random() * 4,
    );
  };
  tick();
  simTimer = setInterval(tick, 1000 / hz);
}

function stopWatch() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
}

export function stopLocation() {
  stopWatch();
  stopOrientation();
  lastFix = null;
  shown = null;
  wantCentre = false;
  onFirstFix = null;
  navRuntime.target = null;
  navRuntime.shown = null;
  navRuntime.heading = null;
  st().set({ locate: 'off', userPos: null, userAcc: null, userHeading: null });
}

/** Locate button: tap 1 asks permission and centres, tap 2 follows, tap 3 (while following) recentres. */
export function locateTap() {
  const s = st();
  if (s.locate === 'off') {
    s.set({ locate: 'on' });
    wantCentre = true;
    startWatch();
    void startOrientation();
    if (s.userPos) {
      wantCentre = false;
      cameraCommands.centerOn(s.userPos[0], s.userPos[1]);
    }
  } else if (s.locate === 'on') {
    s.set({ locate: 'follow' });
    if (s.userPos) cameraCommands.centerOn(s.userPos[0], s.userPos[1]);
  } else if (s.userPos) cameraCommands.centerOn(s.userPos[0], s.userPos[1]);
}

/**
 * For "My location" as the route start: make sure tracking is on (this is where permission is asked, once, from the
 * Directions tap), then hand back the first position.
 */
export function locateThen(cb: (p: Vec2) => void) {
  const s = st();
  if (s.userPos) return cb(s.userPos);
  onFirstFix = cb;
  if (s.locate === 'off') {
    s.set({ locate: 'on' });
    startWatch();
    void startOrientation();
  }
}

/** Retry after "Location off, tap to enable". */
export function enableLocation() {
  const s = st();
  s.setChip(null, 'locationOff');
  if (s.locate === 'off') s.set({ locate: 'on' });
  startWatch();
  void startOrientation();
  if (s.navOpen && s.to && !s.from)
    onFirstFix = (p) => st().set({ from: { name: 'My location', pos: p } });
}

/** Mount once: pauses the watch when the tab is hidden (battery) and resumes after. */
export function useLocationLifecycle() {
  useEffect(() => {
    const vis = () => {
      if (document.hidden) stopWatch();
      else if (st().locate !== 'off') startWatch();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      stopWatch();
      stopOrientation();
    };
  }, []);
}
