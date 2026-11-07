'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTier } from '@/lib/tier';
import { TREE_CAP, type TreeSpot, type TreeType } from '@/lib/scatter';
import { groundY } from '@/lib/terrain';
import type { CampusData } from '@/lib/types';
import { useApp } from '@/store/useApp';
import { sharedUniforms } from './materials';
import { sceneModel } from './model';

interface Part {
  geo: THREE.BufferGeometry;
  y: number;
  sx: number;
  sy: number;
  sz: number;
  greens?: string[];
  color?: string;
  sway: boolean;
}

const ico = (d = 0) => new THREE.IcosahedronGeometry(1, d);
const PARTS: Record<TreeType, Part[]> = {
  round: [
    {
      geo: new THREE.CylinderGeometry(0.18, 0.26, 1, 5),
      y: 1.4,
      sx: 1,
      sy: 2.8,
      sz: 1,
      color: '#7a5a3c',
      sway: false,
    },
    {
      geo: ico(),
      y: 4.8,
      sx: 2.1,
      sy: 2.3,
      sz: 2.1,
      greens: ['#4f9546', '#5fa04e', '#6bb25a', '#7cbd5f'],
      sway: true,
    },
  ],
  conifer: [
    {
      geo: new THREE.CylinderGeometry(0.15, 0.22, 1, 5),
      y: 0.8,
      sx: 1,
      sy: 1.6,
      sz: 1,
      color: '#6b4d33',
      sway: false,
    },
    {
      geo: new THREE.ConeGeometry(1, 1, 7),
      y: 3.0,
      sx: 1.7,
      sy: 3.4,
      sz: 1.7,
      greens: ['#2f6b45', '#2a5e3f', '#38774d'],
      sway: true,
    },
    {
      geo: new THREE.ConeGeometry(1, 1, 7),
      y: 4.6,
      sx: 1.2,
      sy: 2.6,
      sz: 1.2,
      greens: ['#2f6b45', '#2a5e3f', '#38774d'],
      sway: true,
    },
  ],
  palm: [
    {
      geo: new THREE.CylinderGeometry(0.12, 0.2, 1, 5),
      y: 3.2,
      sx: 1,
      sy: 6.4,
      sz: 1,
      color: '#9a7b57',
      sway: false,
    },
    {
      geo: ico(),
      y: 6.6,
      sx: 2.2,
      sy: 0.55,
      sz: 2.2,
      greens: ['#4e9a4a', '#5fa854', '#3f8a46'],
      sway: true,
    },
  ],
  shrub: [
    {
      geo: ico(),
      y: 0.55,
      sx: 0.9,
      sy: 0.65,
      sz: 0.9,
      greens: ['#4a8a45', '#5a9a50', '#3f7d40'],
      sway: false,
    },
  ],
};

const tmpM = new THREE.Matrix4(),
  tmpQ = new THREE.Quaternion(),
  UP = new THREE.Vector3(0, 1, 0);
const tmpP = new THREE.Vector3(),
  tmpS = new THREE.Vector3();

const swayMat = (sway: boolean) => {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
  if (sway) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = sharedUniforms.uTime;
      sh.uniforms.uSway = swayUniform;
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uSway;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float sw = sin(uTime * 1.6 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17) * 0.07 * uSway;
transformed.x += sw * (position.y + 1.0); transformed.z += sw * 0.6 * (position.y + 1.0);`,
        );
    };
  }
  return m;
};
/** 1 = sway on, 0 = off (low quality). */
const swayUniform = { value: 1 };

function TreeGroup({ type, spots }: { type: TreeType; spots: TreeSpot[] }) {
  const parts = PARTS[type];
  const terrainOn = useApp((s) => s.terrainOn);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const mats = useMemo(() => parts.map((p) => swayMat(p.sway)), [parts]);
  useEffect(() => {
    parts.forEach((p, pi) => {
      const mesh = refs.current[pi];
      if (!mesh) return;
      const col = new THREE.Color();
      spots.forEach((s, i) => {
        tmpQ.setFromAxisAngle(UP, s.rot);
        tmpP.set(s.x, p.y * s.s + groundY(s.x, s.z), s.z);
        tmpS.set(p.sx * s.s, p.sy * s.s, p.sz * s.s);
        tmpM.compose(tmpP, tmpQ, tmpS);
        mesh.setMatrixAt(i, tmpM);
        col.set(
          p.greens ? p.greens[Math.floor(s.tint * p.greens.length) % p.greens.length] : p.color!,
        );
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    // terrainOn re-places the trees on the ground
  }, [spots, parts, terrainOn]);
  if (!spots.length) return null;
  return (
    <>
      {parts.map((p, i) => (
        <instancedMesh
          key={`${type}${i}${spots.length}`}
          ref={(r) => {
            refs.current[i] = r;
          }}
          args={[p.geo, mats[i], spots.length]}
          castShadow={p.sway && type !== 'shrub'}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

export function Trees({ data }: { data: CampusData }) {
  const show = useApp((s) => s.showTrees);
  const tier = useTier();
  const low = tier === 'low';
  const cap = TREE_CAP[tier];
  const all = sceneModel(data).trees;
  const by = useMemo(() => {
    const list = all.slice(0, cap);
    return (['round', 'conifer', 'palm', 'shrub'] as TreeType[]).map(
      (t) => [t, list.filter((x) => x.type === t)] as const,
    );
  }, [all, cap]);
  useEffect(() => {
    swayUniform.value =
      low || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  }, [low]);
  if (!show) return null;
  return (
    <>
      {by.map(([t, s]) => (
        <TreeGroup key={t} type={t} spots={s} />
      ))}
    </>
  );
}
