'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CampusData, Polyline, Vec2 } from '@/lib/types';
import { groundY } from '@/lib/terrain';
import { useTier } from '@/lib/tier';
import { useApp } from '@/store/useApp';
import { rng } from './geom';
import { sharedUniforms } from './materials';
import { camState } from './camState';

interface Walker {
  pts: Vec2[];
  cum: number[];
  total: number;
  speed: number;
  offset: number;
}

function makeWalker(line: Polyline, speed: number, offset: number): Walker {
  const cum = [0];
  for (let i = 1; i < line.points.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(
          line.points[i][0] - line.points[i - 1][0],
          line.points[i][1] - line.points[i - 1][1],
        ),
    );
  }
  return { pts: line.points, cum, total: cum.at(-1)!, speed, offset };
}

/** Position + heading at distance d along a walker's polyline (ping-pong). */
function sample(w: Walker, time: number, out: { x: number; z: number; a: number }) {
  const span = w.total * 2;
  let d = (time * w.speed + w.offset) % span;
  const back = d > w.total;
  if (back) d = span - d;
  let i = 1;
  while (i < w.cum.length - 1 && w.cum[i] < d) i++;
  const seg = w.cum[i] - w.cum[i - 1] || 1;
  const t = (d - w.cum[i - 1]) / seg;
  const a = w.pts[i - 1],
    b = w.pts[i];
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  out.a = Math.atan2(b[1] - a[1], b[0] - a[0]) + (back ? Math.PI : 0);
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s1 = new THREE.Vector3(1, 1, 1);
const tmp = { x: 0, z: 0, a: 0 };

function Walkers({
  lines,
  count,
  speed,
  y,
  color,
  geometry,
  jitter,
}: {
  lines: Polyline[];
  count: number;
  speed: [number, number];
  y: number;
  color?: string[];
  geometry: React.ReactNode;
  jitter: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const colored = useRef(false);
  const walkers = useMemo(() => {
    const r = rng(count * 13 + 5);
    if (!lines.length) return [];
    return Array.from({ length: count }, () => {
      const l = lines[Math.floor(r() * lines.length)];
      return makeWalker(l, speed[0] + r() * (speed[1] - speed[0]), r() * 1000);
    });
  }, [lines, count, speed]);
  const cols = useMemo(() => (color ?? ['#ffffff']).map((c) => new THREE.Color(c)), [color]);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    walkers.forEach((w, i) => {
      sample(w, t, tmp);
      const bob = jitter ? Math.abs(Math.sin(t * 7 + i)) * jitter : 0;
      e.set(0, -tmp.a, 0);
      q.setFromEuler(e);
      v.set(tmp.x, y + bob + groundY(tmp.x, tmp.z), tmp.z);
      m4.compose(v, q, s1);
      mesh.setMatrixAt(i, m4);
      if (!colored.current) mesh.setColorAt(i, cols[i % cols.length]);
    });
    colored.current = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  if (!walkers.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, walkers.length]}
      castShadow
      frustumCulled={false}
    >
      {geometry}
    </instancedMesh>
  );
}

export function Life({ data }: { data: CampusData }) {
  const tier = useTier();
  const low = tier === 'low';
  const reduced = useApp((s) => s.screenshot);
  const clouds = useApp((s) => s.showClouds);
  const prefersReduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const longFoot = useMemo(
    () => data.footways.filter((f) => f.kind === 'footway' && f.points.length > 3),
    [data],
  );
  const mainRoads = useMemo(
    () =>
      data.roads.filter(
        (r) => /secondary|tertiary|residential/.test(r.kind) && r.points.length > 3,
      ),
    [data],
  );
  const studentColors = useMemo(
    () => ['#e76f51', '#2a9d8f', '#e9c46a', '#457b9d', '#9b5de5', '#f4a261'],
    [],
  );
  const carColors = useMemo(() => ['#d9534f', '#f0ad4e', '#e8e8e8', '#3b6ea5'], []);
  const sp1 = useMemo<[number, number]>(() => [1.0, 1.5], []);
  const sp2 = useMemo<[number, number]>(() => [5, 9], []);
  if (reduced) return null;
  return (
    <>
      <Walkers
        lines={longFoot}
        count={low ? 14 : tier === 'medium' ? 24 : 36}
        speed={sp1}
        y={0.9}
        color={studentColors}
        jitter={0.08}
        geometry={
          <>
            <capsuleGeometry args={[0.28, 0.8, 2, 6]} />
            <meshStandardMaterial roughness={0.9} />
          </>
        }
      />
      {!low && clouds && !prefersReduced && <Clouds />}
      {!low && !prefersReduced && <Birds />}
    </>
  );
}

function Clouds() {
  const group = useRef<THREE.Group>(null);
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const clouds = useMemo(() => {
    const r = rng(99);
    return Array.from({ length: 6 }, () => ({
      x: (r() - 0.5) * 3600,
      y: 520 + r() * 120, // high altitude only: above the working camera heights
      z: (r() - 0.5) * 3000,
      s: 0.8 + r() * 1.2,
      puffs: Array.from({ length: 4 }, () => ({
        dx: (r() - 0.5) * 60,
        dy: (r() - 0.5) * 8,
        dz: (r() - 0.5) * 24,
        r: 18 + r() * 16,
      })),
    }));
  }, []);
  useFrame(({ camera }, dt) => {
    group.current?.children.forEach((c) => {
      c.position.x += dt * 4;
      if (c.position.x > 1900) c.position.x = -1900;
    });
    // Fade out as the camera comes close, and never sit over the selected landmark or the view centre.
    const st = useApp.getState();
    const near = Math.min(1, Math.max(0, (camera.position.y - 380) / 500));
    const sel = st.selectedId ? st.data?.places.find((p) => p.id === st.selectedId) : null;
    group.current?.children.forEach((c, i) => {
      let k = near;
      for (const t of [sel?.pos, camState.target] as (Vec2 | undefined)[])
        if (t)
          k *= Math.min(
            1,
            Math.max(0, (Math.hypot(c.position.x - t[0], c.position.z - t[1]) - 260) / 300),
          );
      c.visible = k > 0.02;
      for (let j = 0; j < 4; j++) {
        const m = mats.current[i * 4 + j];
        if (m) m.opacity = 0.32 * k;
      }
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {c.puffs.map((p, j) => (
            <mesh key={j} position={[p.dx, p.dy, p.dz]} scale={[1.4, 0.7, 1]}>
              <icosahedronGeometry args={[p.r, 1]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (m) mats.current[i * 4 + j] = m;
                }}
                color="#ffffff"
                roughness={1}
                transparent
                opacity={0.3}
                depthWrite={false}
                fog={false}
                emissive="#ffffff"
                emissiveIntensity={0.1}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Birds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 8;
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const R = 120 + i * 30,
        a = t * (0.12 + i * 0.01) + i * 2;
      v.set(Math.cos(a) * R, 70 + (i % 3) * 14 + Math.sin(t + i) * 3, Math.sin(a) * R * 0.7);
      e.set(0, -a - Math.PI / 2, Math.sin(t * 9 + i) * 0.5);
      q.setFromEuler(e);
      m4.compose(v, q, s1);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <coneGeometry args={[1.1, 3.2, 3]} />
      <meshStandardMaterial color="#2b2b33" />
    </instancedMesh>
  );
}

/** Waving flags at gates. */
export function Flags({ data }: { data: CampusData }) {
  useApp((s) => s.terrainOn); // re-render when the terrain toggles
  const gates = useMemo(
    () => data.places.filter((p) => p.category === 'gate' && !p.id.startsWith('osm-')),
    [data],
  );
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#1e7b4a',
      side: THREE.DoubleSide,
      roughness: 1,
    });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = sharedUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed.z += sin(uTime * 4.0 + position.x * 3.0) * 0.25 * (position.x + 0.8);',
        );
    };
    return m;
  }, []);
  return (
    <>
      {gates.map((g) => (
        <group key={g.id} position={[g.pos[0] + 4, groundY(g.pos[0] + 4, g.pos[1]), g.pos[1]]}>
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 10, 6]} />
            <meshStandardMaterial color="#d8d8d8" />
          </mesh>
          <mesh position={[1.0, 8.6, 0]} material={mat}>
            <planeGeometry args={[1.8, 1.2, 8, 2]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
