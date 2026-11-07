'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CampusData, Vec2 } from '@/lib/types';
import { groundY } from '@/lib/terrain';
import { useApp } from '@/store/useApp';
import { rng } from './geom';
import { sharedUniforms } from './materials';
import { sceneModel } from './model';

interface Spot {
  x: number;
  z: number;
}

/** Lamp posts along roads and footways, kept clear of buildings, water and pitches. Trees and cars live in Nature/Cars. */
export function useLamps(data: CampusData): Spot[] {
  return useMemo(() => {
    const { obstacles } = sceneModel(data);
    const rand = rng(7);
    const lamps: Spot[] = [];
    const lines = [
      ...data.roads.filter((r) => r.kind !== 'service' && r.kind !== 'busway'),
      ...data.footways.filter((f) => f.kind === 'footway'),
    ];
    for (const r of lines) {
      let acc = 25 * rand();
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1] as Vec2,
          b = r.points[i] as Vec2;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1) continue;
        const nx = -(b[1] - a[1]) / len,
          nz = (b[0] - a[0]) / len;
        for (let t = 0; t < len; t += 5) {
          acc += 5;
          if (acc < 45) continue;
          acc = 0;
          const off = r.kind === 'footway' ? 2 : 6.5;
          const p: Vec2 = [
            a[0] + ((b[0] - a[0]) * t) / len + nx * off,
            a[1] + ((b[1] - a[1]) * t) / len + nz * off,
          ];
          if (!obstacles.blocked(p, 0.6)) lamps.push({ x: p[0], z: p[1] });
        }
      }
    }
    return lamps;
  }, [data]);
}

const tmpM = new THREE.Matrix4();

export function Lamps({ spots }: { spots: Spot[] }) {
  const low = useApp((s) => s.effectiveLow);
  const terrainOn = useApp((s) => s.terrainOn);
  const list = useMemo(() => (low ? spots.filter((_, i) => i % 2 === 0) : spots), [spots, low]);
  const pole = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const headMat = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    if (!pole.current || !head.current) return;
    list.forEach((s, i) => {
      const gy = groundY(s.x, s.z);
      pole.current!.setMatrixAt(i, tmpM.makeTranslation(s.x, 2.2 + gy, s.z));
      head.current!.setMatrixAt(i, tmpM.makeTranslation(s.x, 4.5 + gy, s.z));
    });
    pole.current.instanceMatrix.needsUpdate = true;
    head.current.instanceMatrix.needsUpdate = true;
    // terrainOn re-places the lamps on the ground
  }, [list, terrainOn]);
  useFrame(() => {
    if (headMat.current) headMat.current.emissiveIntensity = sharedUniforms.uNight.value * 3.5;
  });
  return (
    <>
      <instancedMesh ref={pole} args={[undefined, undefined, list.length]} key={'p' + list.length}>
        <cylinderGeometry args={[0.08, 0.1, 4.4, 5]} />
        <meshStandardMaterial color="#3a3f47" />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, list.length]} key={'h' + list.length}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial
          ref={headMat}
          color="#fff3d0"
          emissive="#ffc766"
          emissiveIntensity={0}
        />
      </instancedMesh>
    </>
  );
}
