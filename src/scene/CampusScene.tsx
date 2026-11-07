'use client';
import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { CampusData } from '@/lib/types';
import { useApp } from '@/store/useApp';
import { Buildings } from './Buildings';
import { CameraRig } from './CameraRig';
import { DebugLayer } from './DebugLayer';
import { viewApi } from './viewApi';
import { Environment } from './Environment';
import { Flags, Life } from './Life';
import { EasterEggs, Pins, RouteLine, SelectionRing, UserMarker } from './Markers';
import { ParkedCars, TrafficCars } from './Cars';
import { Trees } from './Nature';
import { Lamps, useLamps } from './Props';
import { SkyLight } from './SkyLight';

/** Lets non-canvas UI request a high-res PNG of the current frame. */
export const captureApi = {
  capture: async (_scale = 2): Promise<Blob | null> => null,
};

/** Drops quality automatically when the frame rate stays low (auto mode only). */
function AutoQuality() {
  const frames = useRef({ n: 0, t: 0, strikes: 0 });
  useFrame((_, dt) => {
    const st = useApp.getState();
    if (st.quality !== 'auto' || st.effectiveLow || st.phase === 'loading') return;
    const f = frames.current;
    f.n++;
    f.t += dt;
    if (f.t >= 3) {
      const fps = f.n / f.t;
      f.strikes = fps < 38 ? f.strikes + 1 : 0;
      f.n = 0;
      f.t = 0;
      if (f.strikes >= 2) {
        st.set({ effectiveLow: true });
        st.setToast('Switched to Low graphics for smoother play');
      }
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
      <AutoQuality />
      <Capture />
    </>
  );
}

export default function CampusScene({ data }: { data: CampusData }) {
  const low = useApp((s) => s.effectiveLow);
  const night = useApp((s) => s.night);
  return (
    <Canvas
      className="!absolute inset-0 touch-none"
      dpr={low ? 1 : [1, 2]}
      shadows={{ type: THREE.PCFShadowMap }}
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
        {!low && (
          <EffectComposer multisampling={4}>
            <Bloom
              intensity={night ? 1.1 : 0.7}
              luminanceThreshold={night ? 0.5 : 0.62}
              mipmapBlur
              radius={0.7}
            />
            <Vignette eskil={false} offset={0.25} darkness={0.55} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
