'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { BuildingShape, CampusData, Place } from '@/lib/types';
import { useApp } from '@/store/useApp';
import { groundY, terrainActive } from '@/lib/terrain';
import { LANDMARK_SHAPES, extrudeWalls, roofParts } from './shapes';
import { CAT_LINE } from './theme';

const LINE_PX = 1.5;
const FACE_OPACITY = 0.07;
const OFF_CAMPUS = '#5b6578';

interface Item {
  b: BuildingShape;
  place?: Place;
  color: THREE.Color;
  cat: string;
}
interface Built {
  items: Item[];
  faces: THREE.BufferGeometry;
  faceStart: number[];
  faceEnd: number[];
  /** per-building edge segment positions (x,y,z pairs) */
  edges: Float32Array[];
  /** per-building face positions, for the selected highlight */
  facePos: Float32Array[];
  byPlace: Map<string, number[]>;
}

function buildingGeoms(b: BuildingShape): THREE.BufferGeometry[] {
  const walls = extrudeWalls(b.footprint, b.holes, b.height);
  if (!walls) return [];
  const custom = b.osmId != null ? LANDMARK_SHAPES[b.osmId] : undefined;
  const parts = custom
    ? [...custom(b), ...(b.roofType === 'dome-center' ? [] : roofParts(b))]
    : roofParts(b);
  return [walls, ...parts].map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    q.deleteAttribute('uv');
    return q;
  });
}

function build(data: CampusData, showOff: boolean): Built {
  const placeById = new Map(data.places.map((p) => [p.id, p]));
  const items: Item[] = [],
    faceGeoms: THREE.BufferGeometry[] = [],
    edges: Float32Array[] = [],
    facePos: Float32Array[] = [];
  const faceStart: number[] = [],
    faceEnd: number[] = [];
  const byPlace = new Map<string, number[]>();
  let v = 0;
  for (const b of data.buildings) {
    if (b.offCampus && !showOff) continue;
    const geoms = buildingGeoms(b);
    if (!geoms.length) continue;
    const place = b.placeId ? placeById.get(b.placeId) : undefined;
    const cat = b.offCampus ? 'offcampus' : b.unit ? 'hostel' : (place?.category ?? 'other');
    const color = new THREE.Color(b.offCampus ? OFF_CAMPUS : (CAT_LINE[cat] ?? CAT_LINE.other));
    const merged = mergeGeometries(geoms, false);
    if (!merged) continue;
    // Terrain on: each building sits level on the lowest ground under its footprint (the uphill side sinks in).
    if (terrainActive()) {
      let dy = Infinity;
      for (const [x, z] of b.footprint) dy = Math.min(dy, groundY(x, z));
      if (dy && Number.isFinite(dy)) merged.translate(0, dy, 0);
    }
    const e = new THREE.EdgesGeometry(merged, 24);
    const idx = items.length;
    items.push({ b, place, color, cat });
    edges.push(new Float32Array(e.attributes.position.array));
    e.dispose();
    const n = merged.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    merged.deleteAttribute('normal');
    facePos.push(new Float32Array(merged.attributes.position.array));
    faceStart.push(v);
    v += n;
    faceEnd.push(v);
    faceGeoms.push(merged);
    if (b.placeId) byPlace.set(b.placeId, [...(byPlace.get(b.placeId) ?? []), idx]);
  }
  const faces = mergeGeometries(faceGeoms, false) ?? new THREE.BufferGeometry();
  faces.computeBoundingSphere();
  return { items, faces, faceStart, faceEnd, edges, facePos, byPlace };
}

function lineGeometry(
  idxs: number[],
  built: Built,
  colors: (i: number) => THREE.Color,
): LineSegmentsGeometry {
  let total = 0;
  for (const i of idxs) total += built.edges[i].length;
  const pos = new Float32Array(total),
    col = new Float32Array(total);
  let o = 0;
  for (const i of idxs) {
    const e = built.edges[i],
      c = colors(i);
    pos.set(e, o);
    for (let k = 0; k < e.length; k += 3) {
      col[o + k] = c.r;
      col[o + k + 1] = c.g;
      col[o + k + 2] = c.b;
    }
    o += e.length;
  }
  const g = new LineSegmentsGeometry();
  if (total) {
    g.setPositions(pos);
    g.setColors(col);
  }
  return g;
}

export function Buildings({ data }: { data: CampusData }) {
  const showOff = useApp((s) => s.showOffCampus);
  const selectedId = useApp((s) => s.selectedId);
  const category = useApp((s) => s.category);
  const size = useThree((s) => s.size);
  const terrainOn = useApp((s) => s.terrainOn);
  // terrainOn is a dependency on purpose: build() reads the terrain module state that flips with it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => build(data, showOff), [data, showOff, terrainOn]);

  const solid = useMemo(
    () => built.items.map((_, i) => i).filter((i) => !built.items[i].b.provisional),
    [built],
  );
  const prov = useMemo(
    () => built.items.map((_, i) => i).filter((i) => built.items[i].b.provisional),
    [built],
  );

  const lineMat = useMemo(
    () =>
      new LineMaterial({
        linewidth: LINE_PX,
        vertexColors: true,
        transparent: true,
        worldUnits: false,
      }),
    [],
  );
  const dashMat = useMemo(
    () =>
      new LineMaterial({
        linewidth: LINE_PX,
        vertexColors: true,
        transparent: true,
        dashed: true,
        dashSize: 3,
        gapSize: 2,
        worldUnits: false,
      }),
    [],
  );
  const selMat = useMemo(
    () =>
      new LineMaterial({
        linewidth: 3,
        color: 0xffffff,
        transparent: true,
        worldUnits: false,
        depthTest: false,
      }),
    [],
  );
  const faceMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: FACE_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const selFaceMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(() => {
    for (const m of [lineMat, dashMat, selMat]) m.resolution.set(size.width, size.height);
  }, [size, lineMat, dashMat, selMat]);

  const selIdx = useMemo(
    () => (selectedId ? (built.byPlace.get(selectedId) ?? []) : []),
    [built, selectedId],
  );

  // Line colours depend on selection and the active category chip: others dim.
  const lines = useMemo(() => {
    const dim = (i: number) => {
      const it = built.items[i];
      const active = category ? it.cat === category : true;
      const isSel = selIdx.includes(i);
      const c = it.color.clone();
      if (selectedId && !isSel) c.multiplyScalar(0.3);
      else if (!active) c.multiplyScalar(0.22);
      else if (category) c.multiplyScalar(1.15);
      return c;
    };
    const g = lineGeometry(solid, built, dim);
    const obj = new LineSegments2(g, lineMat);
    obj.raycast = () => undefined;
    obj.frustumCulled = false;
    const d = lineGeometry(prov, built, dim);
    const dobj = new LineSegments2(d, dashMat);
    dobj.computeLineDistances();
    dobj.raycast = () => undefined;
    dobj.frustumCulled = false;
    return { obj, dobj };
  }, [built, solid, prov, selIdx, selectedId, category, lineMat, dashMat]);

  const sel = useMemo(() => {
    if (!selIdx.length) return null;
    const g = lineGeometry(selIdx, built, (i) =>
      built.items[i].color.clone().lerp(new THREE.Color('#ffffff'), 0.55),
    );
    const o = new LineSegments2(g, selMat);
    o.raycast = () => undefined;
    o.frustumCulled = false;
    o.renderOrder = 30;
    const fg = mergeGeometries(
      selIdx.map((i) => {
        const q = new THREE.BufferGeometry();
        q.setAttribute('position', new THREE.BufferAttribute(built.facePos[i], 3));
        return q;
      }),
      false,
    );
    const f = fg ? new THREE.Mesh(fg, selFaceMat) : null;
    if (f) {
      f.raycast = () => undefined;
      f.renderOrder = 29;
    }
    return { o, f };
  }, [selIdx, built, selMat, selFaceMat]);

  useEffect(
    () => () => {
      lines.obj.geometry.dispose();
      lines.dobj.geometry.dispose();
    },
    [lines],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    selMat.linewidth = 2.6 + Math.sin(t * 4) * 0.9;
    selMat.opacity = 0.75 + Math.sin(t * 4) * 0.25;
    selFaceMat.opacity = 0.14 + Math.sin(t * 4) * 0.08;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.faceIndex == null) return;
    e.stopPropagation();
    const v = e.faceIndex * 3;
    let lo = 0,
      hi = built.faceStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (built.faceStart[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    const it = built.items[lo];
    const pid = it?.place?.id;
    const st = useApp.getState();
    if (st.pickMode && pid) return void pickEndpoint(pid);
    if (pid) st.select(pid);
    else
      st.setToast(
        it?.b.unit
          ? 'Hostel block unit'
          : it?.b.provisional
            ? 'Provisional block (outline not yet in OSM)'
            : 'Unnamed building',
      );
  };

  return (
    <group>
      <mesh
        geometry={built.faces}
        material={faceMat}
        renderOrder={20}
        onClick={onClick}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      <primitive object={lines.obj} renderOrder={21} />
      <primitive object={lines.dobj} renderOrder={21} />
      {sel?.f && <primitive object={sel.f} />}
      {sel && <primitive object={sel.o} />}
    </group>
  );
}

function pickEndpoint(id: string) {
  const st = useApp.getState();
  const p = st.data?.places.find((x) => x.id === id);
  if (!p || !st.pickMode) return;
  st.set({ [st.pickMode]: { id: p.id, name: p.shortName, pos: p.pos }, pickMode: null } as never);
}
