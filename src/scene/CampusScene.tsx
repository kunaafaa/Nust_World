'use client';
import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { CampusData } from '@/lib/types';
import { defaultTier, tierOf, useTier } from '@/lib/tier';
import { useApp, type Tier } from '@/store/useApp';
import { Buildings } from './Buildings';
import { CameraRig } from './CameraRig';
import { DebugLayer, Probes } from './DebugLayer';
import { viewApi } from './viewApi';
import { Environment } from './Environment';
import { Flags, Life } from './Life';
import { EasterEggs, Pins, RouteLine, SelectionRing, UserMarker } from './Markers';
import { ParkedCars, TrafficCars } from './Cars';
import { Trees } from './Nature';
import { Lamps, useLamps } from './Props';
import { SkyLight } from './SkyLight';

const Post = dynamic(() => import('./Post'), { ssr: false });

/** Lets non-canvas UI request a high-res PNG of the current frame. */
export const captureApi = {
  capture: async (_scale = 2): Promise<Blob | null> => null,
};

/** Render-on-demand driver: full rate while anything is happening, ~20 fps for ambient animation when idle. */
export const driver = { until: 0 };
export const bump = (ms = 2000) => {
  driver.until = Math.max(driver.until, performance.now() + ms);
};
const isActive = () => {
  const st = useApp.getState();
  return (
    performance.now() < driver.until ||
    st.phase !== 'explore' ||
    st.interacting ||
    st.locate === 'follow'
  );
};
function IdleDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    let raf = 0,
      last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return; // paused with the tab
      if (isActive() || t - last > 48) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    const poke = () => bump(1800);
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart'])
      el.addEventListener(ev, poke, { passive: true });
    window.addEventListener('resize', poke);
    const unsub = useApp.subscribe(poke);
    return () => {
      cancelAnimationFrame(raf);
      for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart'])
        el.removeEventListener(ev, poke);
      window.removeEventListener('resize', poke);
      unsub();
    };
  }, [invalidate, el]);
  return null;
}

const DOWN: Record<Tier, Tier> = { high: 'medium', medium: 'low', low: 'low' };
/** Picks High/Medium/Low from the first seconds of frame rate, then drops a tier if it stays under 40 fps. */
function AutoQuality() {
  const f = useRef({ n: 0, t: 0, strikes: 0, probed: false, elapsed: 0 });
  useEffect(() => {
    useApp.setState({ autoTier: defaultTier() });
    bump(4000);
  }, []);
  useFrame((_, dt) => {
    const st = useApp.getState();
    if (st.quality !== 'auto' || st.phase === 'loading') return;
    const s = f.current;
    // only count frames rendered at full rate (idle frames are throttled on purpose)
    if (!isActive()) {
      s.n = 0;
      s.t = 0;
      return;
    }
    s.n++;
    s.t += dt;
    if (s.t < 3) return;
    const fps = s.n / s.t;
    s.n = 0;
    s.t = 0;
    const cur = tierOf(st);
    if (!s.probed) {
      s.probed = true;
      if (fps < 40 && cur !== 'low') {
        useApp.setState({ autoTier: DOWN[cur], effectiveLow: DOWN[cur] === 'low' });
        st.setToast(`Graphics set to ${DOWN[cur]} for smoother play`);
      }
      return;
    }
    s.strikes = fps < 40 ? s.strikes + 1 : 0;
    if (s.strikes >= 2 && cur !== 'low') {
      s.strikes = 0;
      useApp.setState({ autoTier: DOWN[cur], effectiveLow: DOWN[cur] === 'low' });
      st.setToast(`Switched to ${DOWN[cur]} graphics for smoother play`);
    }
  });
  return null;
}

function ViewBridge() {
  useFrame(({ camera, size }) => {
    viewApi.camera = camera;
    viewApi.width = size.width;
    viewApi.height = size.height;
  });
  return null;
}

function Capture() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    captureApi.capture = async (scale = 2) => {
      const prev = gl.getPixelRatio();
      gl.setPixelRatio(Math.min(window.devicePixelRatio * scale, 3));
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      gl.render(scene, camera);
      const blob = await new Promise<Blob | null>((res) => gl.domElement.toBlob(res, 'image/png'));
      gl.setPixelRatio(prev);
      return blob;
    };
  }, [gl, scene, camera]);
  return null;
}

function World({ data }: { data: CampusData }) {
  const lamps = useLamps(data);
  const debug = useApp((s) => s.debug);
  const perfOn = useApp((s) => s.perfOn);
  return (
    <>
      <SkyLight />
      <CameraRig />
      <Environment data={data} />
      <Buildings data={data} />
      <Trees data={data} />
      <Lamps spots={lamps} />
      <ParkedCars data={data} />
      <TrafficCars data={data} />
      <Life data={data} />
      <Flags data={data} />
      <SelectionRing data={data} />
      <Pins data={data} />
      <RouteLine />
      <UserMarker />
      <EasterEggs />
      {debug && <DebugLayer data={data} />}
      <ViewBridge />
      <IdleDriver />
      <AutoQuality />
      {perfOn && <Probes />}
      <Capture />
    </>
  );
}

export default function CampusScene({ data }: { data: CampusData }) {
  const tier = useTier();
  const low = tier === 'low';
  const night = useApp((s) => s.night);
  return (
    <Canvas
      className="!absolute inset-0 touch-none"
      frameloop="demand"
      dpr={low ? 1 : tier === 'medium' ? [1, 1.5] : [1, 2]}
      shadows={low ? false : { type: THREE.PCFShadowMap }}
      camera={{ fov: 42, near: 3, far: 7000, position: [0, 600, 600] }}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      aria-label="Interactive 3D map of the NUST campus"
    >
      <Suspense fallback={null}>
        <World data={data} />
        {tier === 'high' && <Post />}
      </Suspense>
    </Canvas>
  );
}
