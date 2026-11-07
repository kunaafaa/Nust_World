'use client';
import { useEffect } from 'react';
import { project, unproject } from '@/lib/geo';
import {
  ARRIVE_M,
  buildSnapIndex,
  distToPath,
  maybeSnap,
  nearCampus,
  plausible,
  REROUTE_M,
  smooth,
  WEAK_GPS_M,
  type Fix,
  type SnapIndex,
} from '@/lib/location';
import { sfx } from '@/lib/sfx';
import { cameraCommands } from '@/scene/CameraRig';
import { useApp } from '@/store/useApp';
import type { Vec2 } from '@/lib/types';

/**
 * Live location controller. Privacy: positions are held in memory only. Nothing is sent to any server,
 * stored, or logged. Module-level state because there is exactly one GPS watch per tab.
 */
let watchId: number | null = null;
let lastFix: Fix | null = null;
let shown: Vec2 | null = null;
let shownAcc = 50;
let snapIdx: SnapIndex | null = null;
let snapFor: unknown = null;
let wantCentre = false;
let warnedWeak = false,
  warnedOff = false;
let offPathSince = 0;
let arrivedFor: string | null = null;
let orientationOn = false;
let simTimer: ReturnType<typeof setInterval> | null = null;
let onFirstFix: ((p: Vec2) => void) | null = null;

const st = () => useApp.getState();

function ensureSnap() {
  const d = st().data;
  if (!d || snapFor === d) return;
  snapIdx = buildSnapIndex(d.footways.map((f) => f.points));
  snapFor = d;
}

/** Process a raw fix (from the browser or the simulator). */
export function handleFix(lon: number, lat: number, accuracy: number, t = Date.now()) {
  if (!nearCampus(lon, lat)) {
    if (!warnedOff) {
      warnedOff = true;
      st().setToast("You don't seem to be on campus. Pick a gate to start from instead.");
    }
    st().set({ userPos: null, userAcc: null });
    return;
  }
  warnedOff = false;
  const raw = project(lon, lat);
  const fix: Fix = { pos: raw, accuracy, t };
  if (!plausible(lastFix, fix)) return; // ignore teleports (>30 m/s)
  lastFix = fix;
  ensureSnap();
  if (accuracy > WEAK_GPS_M && !warnedWeak) {
    warnedWeak = true;
    st().setToast(
      'GPS signal is weak here. Your position may be off by ' + Math.round(accuracy) + ' m.',
    );
  }
  if (accuracy <= WEAK_GPS_M) warnedWeak = false;
  const sm = smooth(shown, fix, shownAcc);
  shown = sm;
  shownAcc = accuracy;
  const pos = maybeSnap(snapIdx, sm, accuracy);
  st().set({ userPos: pos, userAcc: accuracy });

  if (wantCentre) {
    wantCentre = false;
    cameraCommands.centerOn(pos[0], pos[1]);
  }
  if (onFirstFix) {
    const cb = onFirstFix;
    onFirstFix = null;
    cb(pos);
  }

  // Arrival and off-route detection.
  const { route, to, navOpen } = st();
  if (route && to && navOpen) {
    const left = Math.hypot(pos[0] - to.pos[0], pos[1] - to.pos[1]);
    if (left < ARRIVE_M && arrivedFor !== to.name) {
      arrivedFor = to.name;
      st().setToast(`You have arrived at ${to.name}`);
      sfx.arrive();
    } else if (left >= ARRIVE_M * 2) arrivedFor = null;
    if (st().from?.name === 'My location' && distToPath(pos, route.path) > REROUTE_M) {
      offPathSince ||= t;
      if (t - offPathSince > 3000) {
        offPathSince = 0;
        st().set({ from: { name: 'My location', pos } });
        st().setToast('Rerouting…');
      }
    } else offPathSince = 0;
  }
}

function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }) {
  const h =
    typeof e.webkitCompassHeading === 'number'
      ? e.webkitCompassHeading
      : e.alpha != null
        ? (360 - e.alpha) % 360
        : null;
  if (h != null && !Number.isNaN(h)) st().set({ userHeading: h });
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
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.addEventListener('deviceorientation', onOrientation as EventListener, true);
  orientationOn = true;
}

function stopOrientation() {
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.removeEventListener('deviceorientation', onOrientation as EventListener, true);
  orientationOn = false;
}

function startWatch() {
  if (watchId != null || simTimer) return;
  const sim = new URLSearchParams(location.search).get('simulate');
  if (sim) return startSimulation(sim);
  if (!navigator.geolocation) {
    st().setToast('Location is not available on this device.');
    st().set({ locate: 'off' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (p) => handleFix(p.coords.longitude, p.coords.latitude, p.coords.accuracy, p.timestamp),
    (err) => {
      const msg =
        err.code === 1
          ? 'Location permission was denied. You can still pick a gate to start from.'
          : err.code === 2
            ? 'Your location is unavailable right now. Try moving near a window or outdoors.'
            : 'Getting your location timed out. Try again outdoors.';
      st().setToast(msg);
      if (err.code === 1) stopLocation();
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
  );
}

/** `?simulate=gate1` pretends you are standing at Gate 1 with a little GPS jitter, for testing without leaving home. */
function startSimulation(name: string) {
  const d = st().data;
  const gates = d?.places.filter((p) => p.category === 'gate') ?? [];
  const num = name.match(/gate(\d+)/i)?.[1];
  const g =
    (num &&
      gates.find((x) =>
        new RegExp(`\\bgate\\s*(no\\.?\\s*)?0?${num}\\b`, 'i').test(x.shortName),
      )) ||
    gates[0];
  if (!g) return;
  // Convert scene position back to lon/lat so the full pipeline (bbox check, projection, smoothing) is exercised.
  const [lon, lat] = unproject(g.pos[0], g.pos[1]);
  const tick = () =>
    handleFix(
      lon + (Math.random() - 0.5) * 3e-5,
      lat + (Math.random() - 0.5) * 3e-5,
      8 + Math.random() * 4,
    );
  tick();
  simTimer = setInterval(tick, 1000);
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

/** For "My location" in the route panel: make sure tracking is on, then hand back the first position. */
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
