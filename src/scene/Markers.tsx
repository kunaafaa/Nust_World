'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { EASTER_EGGS } from '@/data/extras';
import { CAT_COLOR } from '@/lib/colors';
import { project } from '@/lib/geo';
import { groundY } from '@/lib/terrain';
import type { CampusData, Place, Vec2 } from '@/lib/types';
import { useApp } from '@/store/useApp';
import { ribbon } from './geom';
import { sharedUniforms } from './materials';

function footprintCenterRing(p: Place) {
  const r = Math.max(
    14,
    Math.sqrt(p.footprints.reduce((a, f) => a + Math.abs(f.length), 0) * 40) + 6,
  );
  return Math.min(r, 70);
}

export function SelectionRing({ data }: { data: CampusData }) {
  const id = useApp((s) => s.selectedId);
  const ref = useRef<THREE.Mesh>(null);
  const place = id ? data.places.find((p) => p.id === id) : null;
  useApp((s) => s.terrainOn); // re-render when the terrain toggles
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.06;
    ref.current.scale.set(s, s, s);
  });
  if (!place) return null;
  const r = footprintCenterRing(place);
  return (
    <mesh
      ref={ref}
      position={[place.pos[0], 0.5 + groundY(place.pos[0], place.pos[1]), place.pos[1]]}
      rotation-x={-Math.PI / 2}
    >
      <ringGeometry args={[r, r + 1.6, 48]} />
      <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}

/** 3D pins for gates and ATMs (flat, footprint-less features). Everything else is labelled by LabelLayer. */
export function Pins({ data }: { data: CampusData }) {
  const category = useApp((s) => s.category);
  const night = useApp((s) => s.night);
  const group = useRef<THREE.Group>(null);
  const pinned = useMemo(
    () =>
      data.places.filter((p) => !p.offCampus && (p.category === 'gate' || p.category === 'atm')),
    [data],
  );
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      const q = pinned[i];
      c.position.y =
        7 + Math.sin(clock.elapsedTime * 2 + i) * 0.6 + (q ? groundY(q.pos[0], q.pos[1]) : 0);
    });
  });
  return (
    <group ref={group}>
      {pinned.map((p) => (
        <group
          key={p.id}
          position={[p.pos[0], 7, p.pos[1]]}
          visible={!category || p.category === category}
        >
          <mesh
            onClick={(e) => {
              if (e.delta > 6) return;
              e.stopPropagation();
              useApp.getState().select(p.id);
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <coneGeometry args={[2.2, 5, 10]} />
            <meshStandardMaterial
              color={CAT_COLOR[p.category]}
              emissive={CAT_COLOR[p.category]}
              emissiveIntensity={night ? 0.8 : 0.15}
            />
          </mesh>
          <mesh position={[0, 4, 0]}>
            <sphereGeometry args={[1.6, 10, 8]} />
            <meshStandardMaterial color="#fff" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function RouteLine() {
  const route = useApp((s) => s.route);
  const from = useApp((s) => s.from);
  const to = useApp((s) => s.to);
  const terrainOn = useApp((s) => s.terrainOn);
  const geom = useMemo(() => {
    if (!route || route.path.length < 2) return null;
    const g = ribbon(route.path, 3.2, 0.9);
    if (!g) return null;
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) gp.setY(i, gp.getY(i) + groundY(gp.getX(i), gp.getZ(i)));
    const cum = new Float32Array(route.path.length * 2);
    let d = 0;
    for (let i = 0; i < route.path.length; i++) {
      if (i)
        d += Math.hypot(
          route.path[i][0] - route.path[i - 1][0],
          route.path[i][1] - route.path[i - 1][1],
        );
      cum[i * 2] = d;
      cum[i * 2 + 1] = d;
    }
    g.setAttribute('cum', new THREE.BufferAttribute(cum, 1));
    return g;
    // terrainOn lifts the route onto the ground
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, terrainOn]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uTime: sharedUniforms.uTime },
        vertexShader:
          'attribute float cum; varying float vC; void main(){ vC = cum; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying float vC; uniform float uTime;
void main(){ float w = 0.5 + 0.5 * sin(vC * 0.35 - uTime * 6.0);
  vec3 c = mix(vec3(0.1,0.75,1.0), vec3(0.6,1.0,0.9), w); gl_FragColor = vec4(c * (1.2 + w), 0.92); }`,
      }),
    [],
  );
  return (
    <>
      {geom && <mesh geometry={geom} material={mat} renderOrder={5} frustumCulled={false} />}
      {from && <Flag pos={from.pos} color="#22c55e" label="A" />}
      {to && <Flag pos={to.pos} color="#ef4444" label="B" />}
    </>
  );
}

function Flag({ pos, color, label }: { pos: Vec2; color: string; label: string }) {
  useApp((s) => s.terrainOn); // re-render when the terrain toggles
  return (
    <group position={[pos[0], groundY(pos[0], pos[1]), pos[1]]}>
      <mesh position={[0, 6, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 12, 6]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 12.5, 0]}>
        <sphereGeometry args={[2.2, 12, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <Html position={[0, 17, 0]} center style={{ pointerEvents: 'none' }}>
        <div
          className="rounded-full px-2 py-0.5 text-xs font-black text-white shadow-lg"
          style={{ background: color }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

export function UserMarker() {
  const pos = useApp((s) => s.userPos);
  const acc = useApp((s) => s.userAcc);
  const heading = useApp((s) => s.userHeading);
  useApp((s) => s.terrainOn); // re-render when the terrain toggles
  const dot = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const cone = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const p = (clock.elapsedTime % 1.6) / 1.6;
    if (halo.current) {
      halo.current.scale.setScalar(1 + p * 2.2);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - p);
    }
    if (dot.current) dot.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.06);
  });
  if (!pos) return null;
  const r = Math.max(4, acc ?? 20); // true metres, not a fixed-size ring
  return (
    <group position={[pos[0], groundY(pos[0], pos[1]), pos[1]]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.5} renderOrder={40}>
        <circleGeometry args={[r, 48]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.52} renderOrder={41}>
        <ringGeometry args={[r - 0.5, r, 48]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {heading != null && (
        <mesh
          ref={cone}
          rotation={[-Math.PI / 2, 0, -(heading * Math.PI) / 180]}
          position-y={0.6}
          renderOrder={42}
        >
          <circleGeometry args={[Math.max(14, Math.min(r, 30)), 16, Math.PI / 2 - 0.5, 1.0]} />
          <meshBasicMaterial
            color="#60a5fa"
            transparent
            opacity={0.45}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <mesh ref={halo} rotation-x={-Math.PI / 2} position-y={0.55} renderOrder={42}>
        <circleGeometry args={[3, 24]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh ref={dot} position-y={2.4} renderOrder={43}>
        <sphereGeometry args={[2.3, 20, 14]} />
        <meshStandardMaterial color="#2563eb" emissive="#3b82f6" emissiveIntensity={1.4} />
      </mesh>
      <mesh position-y={2.4} scale={1.35}>
        <sphereGeometry args={[2.3, 20, 14]} />
        <meshBasicMaterial color="#ffffff" side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/** Hidden collectibles. Click to find; remembered in localStorage. */
export function EasterEggs() {
  const found = useApp((s) => s.found);
  const ref = useRef<THREE.Group>(null);
  const eggs = useMemo(
    () => EASTER_EGGS.map((e) => ({ ...e, pos: project(e.lonLat[0], e.lonLat[1]) })),
    [],
  );
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => {
      c.rotation.y = clock.elapsedTime * 1.5 + i;
    });
  });
  return (
    <group ref={ref}>
      {eggs
        .filter((e) => !found.includes(e.id))
        .map((e) => (
          <mesh
            key={e.id}
            position={[e.pos[0], 3.2 + groundY(e.pos[0], e.pos[1]), e.pos[1]]}
            onClick={(ev) => {
              if (ev.delta > 6) return;
              ev.stopPropagation();
              const st = useApp.getState();
              const next = [...st.found, e.id];
              st.set({ found: next });
              try {
                localStorage.setItem('nw-found', JSON.stringify(next));
              } catch {
                /* ignore */
              }
              st.setToast(`🏆 ${e.label}`);
            }}
          >
            <octahedronGeometry args={[1.3, 0]} />
            <meshStandardMaterial
              color="#ffd34d"
              emissive="#ffb300"
              emissiveIntensity={0.9}
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
        ))}
    </group>
  );
}
