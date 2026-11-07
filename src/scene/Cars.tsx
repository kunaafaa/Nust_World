'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpot } from '@/lib/scatter';
import { groundY } from '@/lib/terrain';
import type { CampusData, Polyline, Vec2 } from '@/lib/types';
import { useTier } from '@/lib/tier';
import { useApp } from '@/store/useApp';
import { rng } from './geom';
import { sharedUniforms } from './materials';
import { sceneModel } from './model';

/** White and silver first: indices match scatter.ts pickColor. */
export const CAR_COLORS = [
  '#f2f2f0',
  '#b9bec6',
  '#2b2f36',
  '#2f4f7f',
  '#8c2f2f',
  '#496a50',
  '#c8a24a',
].map((c) => new THREE.Color(c));

const BODY = new THREE.Color(1, 1, 1),
  GLASS = new THREE.Color('#1a2230'),
  TYRE = new THREE.Color('#0d0f12');
function box(w: number, h: number, l: number, x: number, y: number, z: number, c: THREE.Color) {
  const g = new THREE.BoxGeometry(l, h, w); // length along +X
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3),
  );
  g.deleteAttribute('uv');
  return g;
}
const wheels = (L: number, W: number, r = 0.32) =>
  [
    [-L * 0.32, W / 2],
    [L * 0.32, W / 2],
    [-L * 0.32, -W / 2],
    [L * 0.32, -W / 2],
  ].map(([x, z]) => box(0.3, r * 2, r * 2, x, r, z, TYRE));
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs, false)!;

/** 0 sedan, 1 hatchback, 2 SUV, 3 pickup, 4 van, 5 motorbike. Length along +X, nose at +X. */
export const CAR_GEOS: THREE.BufferGeometry[] = [
  merge([
    box(1.8, 0.7, 4.5, 0, 0.7, 0, BODY),
    box(1.6, 0.6, 2.3, -0.2, 1.3, 0, GLASS),
    box(1.62, 0.12, 2.3, -0.2, 1.62, 0, BODY),
    ...wheels(4.5, 1.7),
  ]),
  merge([
    box(1.75, 0.7, 3.8, 0, 0.7, 0, BODY),
    box(1.6, 0.7, 2.4, -0.3, 1.35, 0, GLASS),
    box(1.62, 0.1, 2.4, -0.3, 1.7, 0, BODY),
    ...wheels(3.8, 1.65),
  ]),
  merge([
    box(1.9, 0.9, 4.7, 0, 0.85, 0, BODY),
    box(1.75, 0.75, 3.2, -0.3, 1.65, 0, GLASS),
    box(1.78, 0.1, 3.2, -0.3, 2.05, 0, BODY),
    ...wheels(4.7, 1.8, 0.38),
  ]),
  merge([
    box(1.9, 0.8, 5.2, 0, 0.85, 0, BODY),
    box(1.7, 0.7, 1.7, 0.9, 1.5, 0, GLASS),
    box(1.72, 0.1, 1.7, 0.9, 1.88, 0, BODY),
    ...wheels(5.2, 1.8, 0.38),
  ]),
  merge([
    box(1.9, 1.7, 5.0, 0, 1.25, 0, BODY),
    box(1.92, 0.5, 1.2, 1.7, 1.55, 0, GLASS),
    ...wheels(5.0, 1.8, 0.36),
  ]),
  merge([
    box(0.35, 0.5, 1.7, 0, 0.6, 0, BODY),
    box(0.5, 0.15, 0.6, -0.2, 0.9, 0, GLASS),
    box(0.15, 0.6, 0.6, 0, 0.3, 0, TYRE),
    box(0.1, 0.62, 0.62, 0.7, 0.31, 0, TYRE),
    box(0.1, 0.62, 0.62, -0.7, 0.31, 0, TYRE),
  ]),
];

const mat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0.25,
});
const M = new THREE.Matrix4(),
  Q = new THREE.Quaternion(),
  UP = new THREE.Vector3(0, 1, 0),
  P = new THREE.Vector3(),
  S = new THREE.Vector3(1, 1, 1);
const place = (m: THREE.InstancedMesh, i: number, x: number, z: number, a: number, y = 0.35) => {
  Q.setFromAxisAngle(UP, -a);
  P.set(x, y + groundY(x, z), z);
  M.compose(P, Q, S);
  m.setMatrixAt(i, M);
};

function ParkedGroup({ model, spots }: { model: number; spots: CarSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const terrainOn = useApp((s) => s.terrainOn);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    spots.forEach((s, i) => {
      place(m, i, s.x, s.z, s.angle);
      m.setColorAt(i, CAR_COLORS[s.color]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    // terrainOn re-places the cars on the ground
  }, [spots, terrainOn]);
  if (!spots.length) return null;
  return (
    <instancedMesh
      key={spots.length}
      ref={ref}
      args={[CAR_GEOS[model], mat, spots.length]}
      castShadow
      frustumCulled={false}
    />
  );
}

export function ParkedCars({ data }: { data: CampusData }) {
  const show = useApp((s) => s.showCars);
  const cars = sceneModel(data).parked.cars;
  const by = useMemo(() => CAR_GEOS.map((_, m) => cars.filter((c) => c.model === m)), [cars]);
  if (!show) return null;
  return (
    <>
      {by.map((s, m) => (
        <ParkedGroup key={m} model={m} spots={s} />
      ))}
    </>
  );
}

// ───────── moving traffic ─────────
interface Veh {
  line: Vec2[];
  cum: number[];
  total: number;
  d: number;
  dir: 1 | -1;
  v: number;
  model: number;
  color: number;
}

const LANE = 1.9;
const MAX_MOVING = 20;
type Pose = { x: number; z: number; a: number };

function sampleAt(v: Veh, d: number, out: Pose) {
  let i = 1;
  while (i < v.cum.length - 1 && v.cum[i] < d) i++;
  const seg = v.cum[i] - v.cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (d - v.cum[i - 1]) / seg));
  const a = v.line[i - 1],
    b = v.line[i];
  out.x = a[0] + (b[0] - a[0]) * t;
  out.z = a[1] + (b[1] - a[1]) * t;
  out.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
}

export function TrafficCars({ data }: { data: CampusData }) {
  const show = useApp((s) => s.showCars);
  const tier = useTier();
  const low = tier === 'low';
  const medium = tier === 'medium';
  const screenshot = useApp((s) => s.screenshot);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const head = useRef<THREE.InstancedMesh>(null),
    tail = useRef<THREE.InstancedMesh>(null);
  const headMat = useRef<THREE.MeshStandardMaterial>(null),
    tailMat = useRef<THREE.MeshStandardMaterial>(null);
  const pose = useRef<Pose>({ x: 0, z: 0, a: 0 });

  const { vehs, rounds } = useMemo(() => {
    const named = data.roads.filter((r) => /indus|loop/i.test(r.name ?? '') && r.points.length > 3);
    const main = data.roads.filter(
      (r) => /^(trunk|secondary|tertiary)$/.test(r.kind) && !r.roundabout && r.points.length > 4,
    );
    const pool: Polyline[] = [...named, ...main]
      .sort((a, b) => b.points.length - a.points.length)
      .slice(0, 14);
    const rand = rng(31);
    const rounds = data.roads
      .filter((r) => r.roundabout)
      .map((r) =>
        r.points.reduce(
          (c, p) => [c[0] + p[0] / r.points.length, c[1] + p[1] / r.points.length] as Vec2,
          [0, 0] as Vec2,
        ),
      );
    const n = low ? 8 : medium ? 12 : MAX_MOVING;
    const vehs: Veh[] = [];
    for (let i = 0; i < n && pool.length; i++) {
      const l = pool[i % pool.length];
      const cum = [0];
      for (let k = 1; k < l.points.length; k++)
        cum.push(
          cum[k - 1] +
            Math.hypot(l.points[k][0] - l.points[k - 1][0], l.points[k][1] - l.points[k - 1][1]),
        );
      const total = cum[cum.length - 1];
      if (total < 40) continue;
      vehs.push({
        line: l.points,
        cum,
        total,
        d: rand() * total,
        dir: rand() < 0.5 ? 1 : -1,
        v: 5.5 + rand() * 2.8, // 20-30 km/h
        model: [0, 0, 1, 2, 3, 4, 5][Math.floor(rand() * 7)],
        color: [0, 0, 1, 1, 2, 3, 4][Math.floor(rand() * 7)],
      });
    }
    return { vehs, rounds };
  }, [data, low, medium]);

  const groups = useMemo(() => CAR_GEOS.map((_, m) => vehs.filter((v) => v.model === m)), [vehs]);

  useEffect(() => {
    groups.forEach((g, m) => {
      const mesh = refs.current[m];
      if (!mesh) return;
      g.forEach((v, i) => mesh.setColorAt(i, CAR_COLORS[v.color]));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [groups, show, screenshot]);

  useFrame(({ camera }, dt) => {
    const hidden = camera.position.y > 800;
    const night = sharedUniforms.uNight.value;
    if (headMat.current) headMat.current.emissiveIntensity = night * 4;
    if (tailMat.current) tailMat.current.emissiveIntensity = night * 3;
    refs.current.forEach((m) => {
      if (m) m.visible = !hidden;
    });
    if (head.current) head.current.visible = !hidden && night > 0.1;
    if (tail.current) tail.current.visible = !hidden && night > 0.1;
    if (hidden) return;
    const step = Math.min(dt, 0.1);
    let li = 0;
    groups.forEach((g, m) => {
      const mesh = refs.current[m];
      if (!mesh) return;
      g.forEach((v, i) => {
        sampleAt(v, v.d, pose.current);
        let f = 1;
        for (const c of rounds)
          if (Math.hypot(c[0] - pose.current.x, c[1] - pose.current.z) < 28) {
            f = 0.4;
            break;
          }
        v.d += v.dir * v.v * f * step;
        if (v.d > v.total) {
          v.d = v.total;
          v.dir = -1;
        } else if (v.d < 0) {
          v.d = 0;
          v.dir = 1;
        }
        sampleAt(v, v.d, pose.current);
        const a = pose.current.a + (v.dir < 0 ? Math.PI : 0);
        // Drive on the left: left of heading (cos a, sin a) in x-east / z-south space is (sin a, -cos a).
        const c = Math.cos(a),
          s = Math.sin(a);
        const x = pose.current.x + s * LANE,
          z = pose.current.z - c * LANE;
        place(mesh, i, x, z, a, 0.4);
        if (head.current && tail.current) {
          for (const side of [-0.65, 0.65]) {
            // lateral axis of the car is (s, -c)
            const gy = groundY(x, z);
            M.makeTranslation(x + c * 2.0 + s * side, 0.75 + gy, z + s * 2.0 - c * side);
            head.current.setMatrixAt(li, M);
            M.makeTranslation(x - c * 2.0 + s * side, 0.8 + gy, z - s * 2.0 - c * side);
            tail.current.setMatrixAt(li, M);
            li++;
          }
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    if (head.current) head.current.instanceMatrix.needsUpdate = true;
    if (tail.current) tail.current.instanceMatrix.needsUpdate = true;
  });

  if (!show || screenshot || !vehs.length) return null;
  return (
    <>
      {groups.map((g, m) =>
        g.length ? (
          <instancedMesh
            key={m + ':' + g.length}
            ref={(r) => {
              refs.current[m] = r;
            }}
            args={[CAR_GEOS[m], mat, g.length]}
            castShadow
            frustumCulled={false}
          />
        ) : null,
      )}
      <instancedMesh
        ref={head}
        args={[undefined, undefined, vehs.length * 2]}
        frustumCulled={false}
        visible={false}
      >
        <boxGeometry args={[0.35, 0.2, 0.12]} />
        <meshStandardMaterial
          ref={headMat}
          color="#fff6d6"
          emissive="#fff0b0"
          emissiveIntensity={0}
        />
      </instancedMesh>
      <instancedMesh
        ref={tail}
        args={[undefined, undefined, vehs.length * 2]}
        frustumCulled={false}
        visible={false}
      >
        <boxGeometry args={[0.3, 0.18, 0.12]} />
        <meshStandardMaterial
          ref={tailMat}
          color="#ff3b30"
          emissive="#ff2a20"
          emissiveIntensity={0}
        />
      </instancedMesh>
    </>
  );
}
