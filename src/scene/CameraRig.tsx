'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GROUND_BUFFER, boundaryDist } from '@/lib/boundary';
import { centroid, SCENE_BOUNDS } from '@/lib/geo';
import type { Vec2 } from '@/lib/types';
import { groundY } from '@/lib/terrain';
import { damp, isNavigating } from '@/lib/navMachine';
import { navDispatch } from '@/lib/navController';
import { navRuntime } from '@/lib/navRuntime';
import { useApp } from '@/store/useApp';
import { camState } from './camState';

const dotMoving = () => {
  const a = navRuntime.shown,
    b = navRuntime.target;
  return !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.05;
};

interface Pose {
  tx: number;
  tz: number;
  dist: number;
  polar: number;
  az: number;
}
/**
 * One camera controller owns all motion. A move sets a goal pose; every frame the pose closes a fixed fraction of
 * the remaining gap (critically damped, frame-rate independent). A new move replaces the old one, so moves never
 * fight. `lambda` = 5 / duration settles to within 1 % in about `duration` seconds.
 */
interface Anim {
  to: Pose;
  lambda: number;
}

let idleTimer: ReturnType<typeof setTimeout> | undefined;
const ringCache: { ring: Vec2[] | null; c: Vec2 } = { ring: null, c: [0, 0] };
const HOME: Pose = { tx: 0, tz: 0, dist: 820, polar: 0.95, az: 0.35 };
/** Navigation: walking zoom on start, tilt for top-down, follow stiffness */
export const NAV_WALK_DIST = 170;
const TOP = 0.02;
const TILT = 0.85;
const FOLLOW_LAMBDA = 6;
/**
 * Longest frame step the damping uses (s). Exponential damping is stable for any step, so this only guards against
 * long hitches (tab switch); a tighter cap made flights 2 to 3x slower in real time on 5 to 10 fps devices.
 */
const MAX_STEP_S = 0.25;
const RECENTRE_S = 0.4;

/** Exposed so UI can request camera moves without touching three.js. */
export const cameraCommands = {
  fitPoints: (_pts: [number, number][]) => {},
  zoomBy: (_f: number) => {},
  centerOn: (_x: number, _z: number) => {},
  /** Fly to the user's dot for navigation (start = also set the walking zoom). */
  navFollow: (_start: boolean) => {},
};

const wrapAz = (a: number, ref: number) => {
  while (a - ref > Math.PI) a -= Math.PI * 2;
  while (a - ref < -Math.PI) a += Math.PI * 2;
  return a;
};
/** North up (0) or heading up (camera behind the user's heading). */
const navAzimuth = (headingUp: boolean) =>
  headingUp && navRuntime.heading != null ? -(navRuntime.heading * Math.PI) / 180 : 0;

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl, raycaster, events } = useThree();
  const anim = useRef<Anim | null>(null);
  const phase = useApp((s) => s.phase);
  const topDown = useApp((s) => s.topDown);
  const reduced = useRef(false);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const viewShift = useRef(0);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const readPose = (): Pose => {
    const c = controls.current!;
    const off = camera.position.clone().sub(c.target);
    const dist = off.length();
    return {
      tx: c.target.x,
      tz: c.target.z,
      dist,
      polar: Math.acos(Math.min(1, Math.max(-1, off.y / dist))),
      az: Math.atan2(off.x, off.z),
    };
  };
  const applyPose = (p: Pose) => {
    const c = controls.current!;
    const ty = groundY(p.tx, p.tz); // 0 unless the optional terrain is on
    c.target.set(p.tx, ty, p.tz);
    camera.position.set(
      p.tx + p.dist * Math.sin(p.polar) * Math.sin(p.az),
      ty + p.dist * Math.cos(p.polar),
      p.tz + p.dist * Math.sin(p.polar) * Math.cos(p.az),
    );
    camera.lookAt(c.target);
  };
  const flyTo = (to: Partial<Pose>, dur = 1.2) => {
    if (!controls.current) return;
    const from = readPose();
    const target = { ...from, ...to };
    target.az = wrapAz(target.az, from.az); // the short way around
    // replaces any running move: there is only ever one
    anim.current = { to: target, lambda: reduced.current ? 1e4 : 5 / Math.max(0.05, dur) };
  };

  // Initial pose
  useEffect(() => {
    if (controls.current) applyPose(HOME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Public commands
  useEffect(() => {
    cameraCommands.fitPoints = (pts) => {
      if (!pts.length) return;
      let a = Infinity,
        b = Infinity,
        c = -Infinity,
        d = -Infinity;
      for (const [x, z] of pts) {
        a = Math.min(a, x);
        b = Math.min(b, z);
        c = Math.max(c, x);
        d = Math.max(d, z);
      }
      const span = Math.max(c - a, d - b, 60);
      // Phones: the sheet covers the bottom, and the view is shifted to centre the area above it. Zoom out so the
      // whole route fits in that smaller area.
      const st = useApp.getState();
      const h = window.innerHeight;
      const covered = window.innerWidth < 768 && h > 500 ? Math.min(0.6, st.sheetPx / h) : 0;
      flyTo({
        tx: (a + c) / 2,
        tz: (b + d) / 2,
        dist: (span * 1.5 + 40) / (1 - covered),
        polar: st.topDown ? TOP : TILT,
      });
    };
    cameraCommands.navFollow = (start) => {
      const st = useApp.getState();
      const p = navRuntime.shown ?? navRuntime.target ?? st.userPos;
      if (!p) return;
      flyTo(
        {
          tx: p[0],
          tz: p[1],
          ...(start ? { dist: NAV_WALK_DIST } : {}),
          polar: st.topDown ? TOP : TILT,
          az: navAzimuth(st.headingUp),
        },
        RECENTRE_S,
      );
    };
    if (useApp.getState().debug || new URLSearchParams(location.search).has('shots')) {
      // Debug-only handle for scripted screenshots: __nwFly(x, z, distance, polar, azimuth)
      (window as unknown as { __nwFly?: unknown }).__nwFly = (
        x: number,
        z: number,
        dist = 150,
        polar = 0.85,
        az = 0.35,
      ) => flyTo({ tx: x, tz: z, dist, polar, az }, 0.01);
    }
    cameraCommands.centerOn = (x, z) =>
      flyTo(
        {
          tx: x,
          tz: z,
          dist: Math.min(readPose().dist, 170),
          polar: useApp.getState().topDown ? 0.02 : 0.85,
        },
        0.8,
      );
    cameraCommands.zoomBy = (f) => {
      const p = readPose();
      flyTo({ dist: Math.min(1700, Math.max(30, p.dist * f)) }, 0.35);
    };
  });

  // Selection focus
  const focusTick = useApp((s) => s.focusTick);
  useEffect(() => {
    const st = useApp.getState();
    const pl = st.selectedId ? st.data?.places.find((p) => p.id === st.selectedId) : null;
    if (pl)
      flyTo({
        tx: pl.pos[0],
        tz: pl.pos[1],
        dist: Math.max(110, pl.resolvedHeight * 7 + 70),
        polar: st.topDown ? 0.02 : 0.85,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick]);

  const resetTick = useApp((s) => s.resetTick);
  useEffect(() => {
    if (resetTick) flyTo({ ...HOME, polar: useApp.getState().topDown ? 0.02 : HOME.polar }, 1.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick]);
  useEffect(() => {
    if (phase === 'explore') flyTo({ ...HOME }, 2.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => {
    // While navigating, the follow controller owns the tilt (and a running navigation flight must not be replaced).
    const st = useApp.getState();
    if (st.nav === 'NAV_FOLLOW') {
      if (anim.current) anim.current.to.polar = topDown ? TOP : TILT;
      return;
    }
    flyTo({ polar: topDown ? TOP : TILT }, 0.9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDown]);

  // Navigation gestures: a one-finger drag (pan) or a two-finger twist (rotate) leaves NAV_FOLLOW for NAV_FREE.
  // A pinch or the mouse wheel only zooms and keeps following. Every touch resets the auto re-centre timer.
  useEffect(() => {
    // The same element OrbitControls listens on (drei: events.connected, else the canvas). Listening on the canvas
    // alone missed gestures that start on a DOM overlay drawn over it (drei <Html>), which OrbitControls still gets.
    const el = (events.connected as HTMLElement | null | undefined) ?? gl.domElement;
    const pts = new Map<number, { x0: number; y0: number; x: number; y: number }>();
    let twist0: number | null = null;
    let decided = false;
    let rightButton = false;
    const touch = () => {
      navRuntime.lastTouch = performance.now();
    };
    // A finger (or the wheel) always wins over a running flight: cancel it and hand the camera to the controls, or a
    // pinch that starts during the 400 ms navigation flight would be ignored. Runs in the capture phase, before
    // OrbitControls' own listener on the same element sees the event.
    const takeOver = () => {
      if (!anim.current || !isNavigating(useApp.getState().nav)) return;
      anim.current = null;
      if (controls.current) controls.current.enabled = true;
    };
    const angle = () => {
      const [a, b] = [...pts.values()];
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    const down = (e: PointerEvent) => {
      touch();
      takeOver();
      pts.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      decided = false;
      rightButton = e.pointerType === 'mouse' && e.button === 2;
      twist0 = pts.size === 2 ? angle() : null;
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      touch();
      p.x = e.clientX;
      p.y = e.clientY;
      if (decided || useApp.getState().nav !== 'NAV_FOLLOW') return;
      if (pts.size === 1 && Math.hypot(p.x - p.x0, p.y - p.y0) > 8) {
        decided = true;
        navDispatch({ type: 'GESTURE', kind: rightButton ? 'rotate' : 'pan' });
      } else if (pts.size === 2 && twist0 != null) {
        const d = Math.abs(wrapAz(angle(), twist0) - twist0);
        if (d > 0.2) {
          decided = true;
          navDispatch({ type: 'GESTURE', kind: 'rotate' });
        }
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) twist0 = null;
      touch();
    };
    const wheel = () => {
      touch();
      takeOver();
    };
    const opts = { passive: true } as const;
    const first = { passive: true, capture: true } as const;
    el.addEventListener('pointerdown', down, first);
    el.addEventListener('pointermove', move, opts);
    el.addEventListener('pointerup', up, opts);
    el.addEventListener('pointercancel', up, opts);
    el.addEventListener('wheel', wheel, first);
    return () => {
      el.removeEventListener('pointerdown', down, first);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel, first);
    };
  }, [gl, events.connected]);

  // Double tap / double click zoom-in at the tapped ground point.
  useEffect(() => {
    const el = gl.domElement;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const up = (e: PointerEvent) => {
      const now = performance.now(),
        l = lastTap.current;
      const isDouble = now - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 28;
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      if (!isDouble || useApp.getState().phase !== 'explore') return;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      if (raycaster.ray.intersectPlane(plane, hit))
        flyTo({ tx: hit.x, tz: hit.z, dist: Math.max(40, readPose().dist * 0.5) }, 0.6);
    };
    el.addEventListener('pointerup', up);
    return () => el.removeEventListener('pointerup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, raycaster]);

  useFrame((state, dt) => {
    const c = controls.current;
    if (!c) return;
    const st = useApp.getState();
    if (st.phase !== 'explore') {
      // Cinematic fly-over: slow orbit with gentle dolly.
      const t = state.clock.elapsedTime * 0.07;
      applyPose({
        tx: Math.sin(t * 1.3) * 120,
        tz: Math.cos(t) * 80,
        dist: 330 + Math.sin(t * 2) * 60,
        polar: 0.62 + Math.sin(t * 1.7) * 0.08,
        az: t,
      });
      c.enabled = false;
      return;
    }
    c.enabled = !anim.current;
    let camMoving = false;
    const following = st.nav === 'NAV_FOLLOW' && !!navRuntime.shown;
    if (anim.current) {
      const a = anim.current;
      // a navigation flight tracks the moving dot instead of where it was when the flight began
      if (following) {
        a.to.tx = navRuntime.shown![0];
        a.to.tz = navRuntime.shown![1];
      }
      const p = readPose();
      const k = damp(a.lambda, Math.min(dt, MAX_STEP_S));
      const next = {
        tx: p.tx + (a.to.tx - p.tx) * k,
        tz: p.tz + (a.to.tz - p.tz) * k,
        dist: p.dist + (a.to.dist - p.dist) * k,
        polar: p.polar + (a.to.polar - p.polar) * k,
        az: p.az + (wrapAz(a.to.az, p.az) - p.az) * k,
      };
      applyPose(next);
      const done =
        Math.hypot(a.to.tx - next.tx, a.to.tz - next.tz) < 0.3 &&
        Math.abs(a.to.dist - next.dist) < 0.5 &&
        Math.abs(a.to.polar - next.polar) < 0.003 &&
        Math.abs(wrapAz(a.to.az, next.az) - next.az) < 0.003;
      if (done) {
        applyPose(a.to);
        anim.current = null;
        // hand the camera back now, not on the next frame: with on-demand rendering (or a slow phone) the next
        // frame can be hundreds of ms away, and OrbitControls drops a gesture that starts while it is disabled
        c.enabled = true;
      }
    } else if (following) {
      // NAV_FOLLOW: centre on the dot, top-down (or the user's 3D choice), north/heading up. Zoom is the user's.
      const p = readPose();
      const k = damp(FOLLOW_LAMBDA, Math.min(dt, MAX_STEP_S));
      const goalPolar = st.topDown ? TOP : TILT;
      const goalAz = wrapAz(navAzimuth(st.headingUp), p.az);
      const [sx, sz] = navRuntime.shown!;
      const moved =
        Math.abs(sx - p.tx) > 0.02 ||
        Math.abs(sz - p.tz) > 0.02 ||
        Math.abs(goalPolar - p.polar) > 0.001 ||
        Math.abs(goalAz - p.az) > 0.001;
      if (moved)
        applyPose({
          tx: p.tx + (sx - p.tx) * k,
          tz: p.tz + (sz - p.tz) * k,
          dist: p.dist,
          polar: p.polar + (goalPolar - p.polar) * k,
          az: p.az + (goalAz - p.az) * k,
        });
      camMoving = moved;
    }
    navRuntime.moving = !!anim.current || camMoving || dotMoving();
    // On phones a bottom sheet covers the lower half: shift the projection up so the subject stays visible.
    // The shift equals half the sheet's visible height, so the subject is centred in the map area above it.
    const sheet =
      (st.selectedId || st.navOpen || st.settingsOpen) &&
      st.sheetPx > 0 &&
      state.size.width < 768 &&
      state.size.height > 500;
    const want = sheet ? Math.min(0.3, st.sheetPx / (2 * state.size.height)) : 0;
    if (Math.abs(viewShift.current - want) > 0.001) {
      viewShift.current += (want - viewShift.current) * Math.min(1, dt * 8);
      const cam = camera as THREE.PerspectiveCamera;
      if (viewShift.current < 0.002 && want === 0) {
        viewShift.current = 0;
        cam.clearViewOffset();
      } else
        cam.setViewOffset(
          state.size.width,
          state.size.height,
          0,
          state.size.height * viewShift.current,
          state.size.width,
          state.size.height,
        );
    }
    // Locate "follow" outside navigation: glide the view with the blue dot (read from the ref, not React state).
    const dotP = navRuntime.shown;
    if (st.locate === 'follow' && dotP && !anim.current && !isNavigating(st.nav)) {
      const k = damp(3, Math.min(dt, MAX_STEP_S));
      const dx = (dotP[0] - c.target.x) * k,
        dz = (dotP[1] - c.target.z) * k;
      c.target.x += dx;
      c.target.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
    }
    // Terrain on: let the orbit target ride the ground (camera moves with it).
    {
      const dy = groundY(c.target.x, c.target.z) - c.target.y;
      if (Math.abs(dy) > 0.01) {
        const k = Math.min(1, dt * 4) * dy;
        c.target.y += k;
        camera.position.y += k;
      }
    }
    // Keep the target inside the boundary buffer with a soft bounce: past the limit a spring pulls it back (and the
    // camera with it), so the edge feels elastic instead of a wall. Without a boundary, fall back to the data box.
    const ring = st.data?.boundary;
    if (ring) {
      if (ring !== ringCache.ring) {
        ringCache.ring = ring;
        ringCache.c = centroid(ring);
      }
      const over = -boundaryDist([c.target.x, c.target.z], ring) - GROUND_BUFFER;
      if (over > 0) {
        const dx = ringCache.c[0] - c.target.x,
          dz = ringCache.c[1] - c.target.z;
        const l = Math.hypot(dx, dz) || 1;
        const step = over > 150 ? over : over * Math.min(1, dt * 7);
        c.target.x += (dx / l) * step;
        c.target.z += (dz / l) * step;
        camera.position.x += (dx / l) * step;
        camera.position.z += (dz / l) * step;
      }
    } else {
      const [minX, minZ, maxX, maxZ] = SCENE_BOUNDS;
      c.target.x = Math.min(maxX, Math.max(minX, c.target.x));
      c.target.z = Math.min(maxZ, Math.max(minZ, c.target.z));
    }
    // 1.15 rad (66 degrees) keeps the horizon above the top of the screen: no sky edge, never under the ground.
    c.maxPolarAngle = st.topDown ? 0.05 : 1.15;
    c.enableRotate = !st.topDown;
    c.update();
    const p = readPose();
    camState.target = [p.tx, p.tz];
    camState.azimuth = p.az;
    camState.distance = p.dist;
    camState.polar = p.polar;
    camState.halfView = p.dist * 0.45;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => {
        if (idleTimer) clearTimeout(idleTimer);
        useApp.setState({ interacting: true });
        if (useApp.getState().locate === 'follow') useApp.setState({ locate: 'on' });
      }}
      onEnd={() => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => useApp.setState({ interacting: false }), 1100);
      }}
      enableDamping
      dampingFactor={0.09}
      screenSpacePanning={false}
      minDistance={25}
      maxDistance={1500}
      rotateSpeed={0.7}
      panSpeed={0.9}
      zoomSpeed={0.9}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  );
}
