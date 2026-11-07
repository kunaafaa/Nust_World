'use client';
import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildGraph } from '@/lib/routing';
import type { CampusData } from '@/lib/types';
import { useApp } from '@/store/useApp';
import { perf } from './perf';

/** Statistics + cursor probes. Cheap enough to mount only when ?debug=1. */
export function Probes() {
  const { gl, camera, scene, raycaster } = useThree();
  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const el = gl.domElement;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      perf.cursor = raycaster.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
    };
    el.addEventListener('pointermove', move);
    return () => el.removeEventListener('pointermove', move);
  }, [gl, camera, raycaster]);
  const acc = { n: 0, t: 0, scan: 0 };
  useFrame((_, dt) => {
    acc.n++;
    acc.t += dt;
    acc.scan += dt;
    if (acc.t >= 0.5) {
      perf.fps = acc.n / acc.t;
      acc.n = 0;
      acc.t = 0;
      perf.calls = gl.info.render.calls;
      perf.triangles = gl.info.render.triangles;
    }
    if (acc.scan >= 1.5) {
      acc.scan = 0;
      let inst = 0;
      scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) inst += (o as THREE.InstancedMesh).count;
      });
      perf.instances = inst;
    }
  });
  return null;
}

/** ?debug=1 overlay: footprints, label anchors, entrances, routing graph, building ids. */
export function DebugLayer({ data }: { data: CampusData }) {
  const showOff = useApp((s) => s.showOffCampus);
  const places = useMemo(() => data.places.filter((p) => showOff || !p.offCampus), [data, showOff]);
  const lines = useMemo(() => {
    const pos: number[] = [];
    for (const p of places) {
      for (const fp of p.footprints) {
        for (let i = 0; i < fp.length; i++) {
          const a = fp[i],
            b = fp[(i + 1) % fp.length];
          pos.push(a[0], p.resolvedHeight + 0.6, a[1], b[0], p.resolvedHeight + 0.6, b[1]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [places]);

  const graph = useMemo(() => {
    const g = buildGraph([...data.footways, ...data.roads.filter((r) => r.kind !== 'busway')]);
    const pos: number[] = [];
    for (const n of g.nodes)
      for (const e of n.edges)
        if (e.to > n.id)
          pos.push(n.pos[0], 0.9, n.pos[1], g.nodes[e.to].pos[0], 0.9, g.nodes[e.to].pos[1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }, [data]);

  const ids = useMemo(
    () => data.buildings.filter((b) => !b.offCampus || showOff).slice(0, 400),
    [data, showOff],
  );
  const cx = (r: [number, number][]) =>
    r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);

  return (
    <group>
      <Probes />
      {/* campus boundary vertices (data/campus-boundary.geojson) */}
      {data.boundary?.map((v, i) => (
        <mesh key={'bv' + i} position={[v[0], 3, v[1]]}>
          <sphereGeometry args={[2.2, 8, 6]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
      ))}
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#ff2d95" />
      </lineSegments>
      <lineSegments geometry={graph}>
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.8} />
      </lineSegments>
      {places.map((p) => (
        <group key={p.id}>
          <mesh position={[p.pos[0], p.resolvedHeight + 4, p.pos[1]]}>
            <sphereGeometry args={[0.9, 8, 6]} />
            <meshBasicMaterial color={p.verified ? '#22c55e' : '#f97316'} />
          </mesh>
          {p.entrance && (
            <mesh position={[p.entrance[0], 1.5, p.entrance[1]]}>
              <boxGeometry args={[2, 3, 2]} />
              <meshBasicMaterial color="#06b6d4" />
            </mesh>
          )}
        </group>
      ))}
      {ids.map((b) => {
        const c = cx(b.footprint);
        return (
          <Html
            key={b.id}
            position={[c[0], b.height + 2, c[1]]}
            distanceFactor={260}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="whitespace-nowrap rounded bg-black/70 px-1 font-mono text-[9px] text-lime-300">
              {b.id.replace(/^way\//, 'w/')}
              {b.provisional ? ' (prov)' : ''}
            </span>
          </Html>
        );
      })}
    </group>
  );
}
