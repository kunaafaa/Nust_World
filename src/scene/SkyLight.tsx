'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useApp } from '@/store/useApp';
import { camState } from './camState';
import { sharedUniforms } from './materials';

const DAY = {
  top: new THREE.Color('#0d1b3a'),
  // The horizon colour IS the fog colour, so distant ground dissolves into the sky and no horizon edge ever shows.
  horizon: new THREE.Color('#0b1630'),
  fog: new THREE.Color('#0b1630'),
};
const NIGHT = {
  top: new THREE.Color('#02050f'),
  horizon: new THREE.Color('#050a1c'),
  fog: new THREE.Color('#050a1c'),
};

/** Gradient sky dome, fog, sun/moon + hemisphere light. `uNight` eases toward the toggle. */
export function SkyLight() {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const skyMat = useRef<THREE.ShaderMaterial>(null);
  const skyMesh = useRef<THREE.Mesh>(null);
  const low = useApp((s) => s.effectiveLow);
  const tmp = useMemo(
    () => ({ top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color() }),
    [],
  );
  const starsRef = useRef<THREE.Group>(null);

  const uniforms = useMemo(
    () => ({ top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } }),
    [],
  );
  const fog = useMemo(() => new THREE.Fog('#0b1630', 700, 3300), []);
  scene.fog = fog;

  useFrame((state, dt) => {
    skyMesh.current?.position.copy(state.camera.position); // the dome follows the camera: it can never be approached or cut
    const night = useApp.getState().night;
    const u = sharedUniforms.uNight;
    u.value += ((night ? 1 : 0) - u.value) * Math.min(1, dt * 2.5);
    sharedUniforms.uTime.value = state.clock.elapsedTime;
    const n = u.value;
    tmp.top.copy(DAY.top).lerp(NIGHT.top, n);
    tmp.hor.copy(DAY.horizon).lerp(NIGHT.horizon, n);
    tmp.fog.copy(DAY.fog).lerp(NIGHT.fog, n);
    uniforms.top.value.copy(tmp.top);
    uniforms.hor.value.copy(tmp.hor);
    fog.color.copy(tmp.fog);
    if (starsRef.current) starsRef.current.visible = n > 0.3;
    if (hemi.current) {
      hemi.current.intensity = 1.1 - n * 0.75;
      hemi.current.color.set('#fff6e0').lerp(new THREE.Color('#6f86c4'), n);
      hemi.current.groundColor.set('#8aa05c').lerp(new THREE.Color('#1a2338'), n);
    }
    const l = sun.current;
    if (l) {
      // Follow the camera target so the shadow frustum stays tight around what you're viewing.
      const tx = camState.target[0],
        tz = camState.target[1];
      l.position.set(tx + 160 - n * 220, 220 - n * 120, tz + 120);
      l.target.position.set(tx, 0, tz);
      l.target.updateMatrixWorld();
      l.intensity = 1.7 - n * 1.3;
      l.color.set('#ffe2b0').lerp(new THREE.Color('#9db4ff'), n);
    }
  });

  return (
    <>
      <mesh ref={skyMesh} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[5000, 24, 16]} />
        <shaderMaterial
          ref={skyMat}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          uniforms={uniforms}
          vertexShader={
            'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
          }
          fragmentShader={`varying vec3 vP; uniform vec3 top; uniform vec3 hor;
void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, smoothstep(0.0, 0.55, h)), 1.0); }`}
        />
      </mesh>
      <group ref={starsRef} visible={false}>
        <Stars radius={3500} depth={200} count={low ? 800 : 2500} factor={14} fade speed={0.3} />
      </group>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow={!low}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-camera-near={10}
        shadow-camera-far={800}
      />
    </>
  );
}
