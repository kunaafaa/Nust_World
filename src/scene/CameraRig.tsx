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
import { useApp } from '@/store/useApp';
import { camState } from './camState';

interface Pose {
  tx: number;
  tz: number;
  dist: number;
  polar: number;
  az: number;
}
interface Anim {
  from: Pose;
  to: Pose;
  t: number;
  dur: number;
}

const ringCache: { ring: Vec2[] | null; c: Vec2 } = { ring: null, c: [0, 0] };
const HOME: Pose = { tx: 0, tz: 0, dist: 820, polar: 0.95, az: 0.35 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Exposed so UI can request camera moves without touching three.js. */
export const cameraCommands = {
  fitPoints: (_pts: [number, number][]) => {},
  zoomBy: (_f: number) => {},
  centerOn: (_x: number, _z: number) => {},
};

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl, raycaster } = useThree();
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
    // Take the short way around in azimuth.
    while (target.az - from.az > Math.PI) target.az -= Math.PI * 2;
    while (target.az - from.az < -Math.PI) target.az += Math.PI * 2;
    anim.current = { from, to: target, t: 0, dur: reduced.current ? 0.01 : dur };
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
      flyTo({
        tx: (a + c) / 2,
        tz: (b + d) / 2,
        dist: span * 1.5 + 40,
        polar: useApp.getState().topDown ? 0.02 : 0.85,
      });
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
    flyTo({ polar: topDown ? 0.02 : 0.85 }, 0.9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDown]);

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
    if (anim.current) {
      const a = anim.current;
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = ease(a.t);
      applyPose({
        tx: lerp(a.from.tx, a.to.tx, k),
        tz: lerp(a.from.tz, a.to.tz, k),
        dist: lerp(a.from.dist, a.to.dist, k),
        polar: lerp(a.from.polar, a.to.polar, k),
        az: lerp(a.from.az, a.to.az, k),
      });
      if (a.t >= 1) anim.current = null;
    }
    // On phones a bottom sheet covers the lower half: shift the projection up so the subject stays visible.
    const sheet = (st.selectedId || st.navOpen) && state.size.width < 768;
    const want = sheet ? 0.2 : 0;
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
    // Follow mode: glide the view with the blue dot.
    if (st.locate === 'follow' && st.userPos && !anim.current) {
      const k = Math.min(1, dt * 3);
      const dx = (st.userPos[0] - c.target.x) * k,
        dz = (st.userPos[1] - c.target.z) * k;
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
        if (useApp.getState().locate === 'follow') useApp.setState({ locate: 'on' });
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
