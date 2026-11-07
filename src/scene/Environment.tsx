'use client';
import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Area, CampusData, Polyline, Vec2 } from '@/lib/types';
import { useApp } from '@/store/useApp';
import { dashes, drape, mergeAll, polygonGeometry, ribbon } from './geom';
import { groundY, terrainActive } from '@/lib/terrain';
import { pitchMarkings } from './pitches';
import { sceneModel } from './model';
import { COL, EDGE, FOOT_WIDTH, LAYER, ROAD_WIDTH, type LayerName } from './theme';
import { edgeFade, setEdgeField, type EdgeKind } from './edge';

/** Every ground layer is its own merged mesh: fixed height + renderOrder + polygonOffset so nothing z-fights. */
function layerMat(
  color: string,
  layer: LayerName,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
  kind: EdgeKind = 'ground',
) {
  const i = Object.keys(LAYER).indexOf(layer);
  return edgeFade(
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -i,
      polygonOffsetUnits: -i,
      ...extra,
    }),
    kind,
  );
}

const fills = (areas: Area[], layer: LayerName) =>
  mergeAll(areas.map((a) => polygonGeometry(a.points, LAYER[layer], a.holes)));
const lines = (ls: Polyline[], widths: Record<string, number>, layer: LayerName, grow = 0) =>
  mergeAll(ls.map((l) => ribbon(l.points, (widths[l.kind] ?? 3) + grow, LAYER[layer])));

const closed = (p: Vec2[]): Vec2[] => (p[0] === p.at(-1) ? p : [...p, p[0]]);

export function Environment({ data }: { data: CampusData }) {
  const terrain = useApp((s) => s.terrain);
  const terrainOn = useApp((s) => s.terrainOn);
  const geo = useMemo(() => {
    const model = sceneModel(data);
    const isForest = (k: string) => /^(forest|wood|scrub|orchard)$/.test(k);
    const roads = data.roads.filter((r) => !r.tunnel);
    const normal = roads.filter((r) => r.kind !== 'busway');
    const markY = LAYER.mark;

    const pitchLines: (THREE.BufferGeometry | null)[] = [];
    const cricket: (THREE.BufferGeometry | null)[] = [];
    for (const p of data.pitches) {
      const m = pitchMarkings(p);
      for (const l of m.lines) pitchLines.push(ribbon(l, 0.18, markY));
      for (const s of m.strips) cricket.push(polygonGeometry(s.slice(0, -1), LAYER.pitch + 0.02));
    }

    // Running tracks: oval ring around football grounds that are mapped as tracks.
    const trackFill = data.pitches.filter((p) => p.sport === 'athletics' || p.kind === 'track');

    const centre: (THREE.BufferGeometry | null)[] = [];
    for (const r of normal) {
      if (r.roundabout || (ROAD_WIDTH[r.kind] ?? 0) < 7 || r.oneway) continue;
      for (const d of dashes(r.points, 3, 4)) centre.push(ribbon(d, 0.2, markY));
    }
    const rings: (THREE.BufferGeometry | null)[] = normal
      .filter((r) => r.roundabout)
      .map((r) => ribbon(closed(r.points), 0.35, markY));
    const bay = parkingLines(model.parked.lines);

    const flat = {
      base: null as THREE.BufferGeometry | null,
      bare: fills([...data.bare], 'bare'),
      grass: fills(
        data.green.filter((g) => !isForest(g.kind)),
        'grass',
      ),
      forest: fills(
        data.green.filter((g) => isForest(g.kind)),
        'forest',
      ),
      water: fills(
        data.water.filter((w) => w.kind !== 'wetland'),
        'water',
      ),
      marsh: fills(data.marsh ?? [], 'water'),
      plaza: fills(data.plazas, 'plaza'),
      parking: fills(data.parking, 'parking'),
      pitch: fills(
        data.pitches.filter((p) => p.kind !== 'track'),
        'pitch',
      ),
      track: fills(trackFill, 'pitch'),
      curb: lines(normal, ROAD_WIDTH, 'curb', 1.0),
      road: lines(normal, ROAD_WIDTH, 'road'),
      busway: lines(
        roads.filter((r) => r.kind === 'busway'),
        ROAD_WIDTH,
        'road',
      ),
      foot: lines(data.footways, FOOT_WIDTH, 'foot'),
      pitchLines: mergeAll(pitchLines),
      cricket: mergeAll(cricket),
      centre: mergeAll([...centre, ...rings]),
      bay: mergeAll(bay),
    };
    // Terrain on: subdivide + lift every ground layer. Off: returns the same geometry objects as before.
    return Object.fromEntries(Object.entries(flat).map(([k, g]) => [k, drape(g)])) as typeof flat;
    // terrainOn is a dependency on purpose: groundY() reads module state that flips with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, terrainOn]);

  // Terrain on: a finely gridded base surface over the heightmap (+300 m margin), and the huge plane dropped below it.
  const baseGrid = useMemo(() => {
    if (!terrainOn || !terrain) return null;
    const [bx0, bz0, bx1, bz1] = terrain.box;
    const x0 = bx0 - 300,
      z0 = bz0 - 300,
      w = bx1 - bx0 + 600,
      h = bz1 - bz0 + 600;
    const g = new THREE.PlaneGeometry(w, h, Math.round(w / 16), Math.round(h / 16));
    g.rotateX(-Math.PI / 2);
    g.translate(x0 + w / 2, 0, z0 + h / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [terrainOn, terrain]);

  // Context ring: thin dim roads beyond the boundary, faded by distance in the shader. No buildings, no labels.
  const contextRoads = useApp((s) => s.contextRoads);
  const ctxGeo = useMemo(
    () =>
      drape(
        mergeAll(contextRoads.map((c) => ribbon(c.pts, c.k === 'service' ? 2 : 3, LAYER.curb))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextRoads, terrainOn],
  );
  useEffect(() => {
    setEdgeField(data.boundary ?? null);
  }, [data.boundary]);
  const borderPts = useMemo(() => {
    const r = data.boundary;
    if (!r) return null;
    const rr = [...r, r[0]];
    return drapeLine(rr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.boundary, terrainOn]);
  const phase = useApp((s) => s.phase);

  const mats = useMemo(
    () => ({
      bare: layerMat(COL.bare, 'bare'),
      grass: layerMat(COL.grass, 'grass'),
      forest: layerMat(COL.forest, 'forest'),
      water: layerMat(COL.water, 'water', {
        roughness: 0.25,
        metalness: 0.1,
        emissive: '#0b3a66',
        emissiveIntensity: 0.35,
      }),
      plaza: layerMat(COL.plaza, 'plaza'),
      parking: layerMat(COL.parking, 'parking'),
      pitch: layerMat(COL.pitch, 'pitch'),
      marsh: layerMat(EDGE.marsh, 'water', {}, 'marsh'),
      context: layerMat(EDGE.contextRoad, 'curb', {}, 'context'),
      curb: layerMat(COL.curb, 'curb', {}, 'road'),
      road: layerMat(COL.asphalt, 'road', {}, 'road'),
      busway: layerMat(COL.busway, 'road', {}, 'road'),
      foot: layerMat(COL.foot, 'foot', {}, 'road'),
      mark: layerMat(COL.pitchLine, 'mark', { emissive: '#222', emissiveIntensity: 0.4 }),
      cricket: layerMat(COL.cricketStrip, 'mark'),
      lane: layerMat(COL.lane, 'mark', {}, 'road'),
      bay: layerMat(COL.parkingLine, 'mark'),
      ground: new THREE.MeshStandardMaterial({ color: COL.base, roughness: 1 }),
    }),
    [],
  );

  const onGround = (e: ThreeEvent<MouseEvent>) => {
    const st = useApp.getState();
    if (e.delta > 6) return;
    if (st.pickMode) {
      e.stopPropagation();
      st.set({
        [st.pickMode]: { name: 'Pinned spot', pos: [e.point.x, e.point.z] },
        pickMode: null,
      } as never);
    } else if (st.selectedId) st.select(null);
  };

  const layer = (g: THREE.BufferGeometry | null, m: THREE.Material, order: number, name: string) =>
    g ? (
      <mesh key={name} name={name} geometry={g} material={m} renderOrder={order} receiveShadow />
    ) : null;

  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={terrainOn && terrain ? terrain.min - 3 : 0}
        receiveShadow
        material={mats.ground}
        onClick={onGround}
      >
        <planeGeometry args={[24000, 24000]} />
      </mesh>
      {baseGrid && (
        <mesh geometry={baseGrid} receiveShadow material={mats.ground} onClick={onGround} />
      )}
      {layer(geo.bare, mats.bare, 1, 'bare')}
      {layer(geo.grass, mats.grass, 2, 'grass')}
      {layer(geo.forest, mats.forest, 3, 'forest')}
      {layer(geo.water, mats.water, 4, 'water')}
      {layer(geo.marsh, mats.marsh, 4, 'marsh')}
      {layer(ctxGeo, mats.context, 8, 'context-roads')}
      {layer(geo.plaza, mats.plaza, 5, 'plaza')}
      {layer(geo.parking, mats.parking, 6, 'parking')}
      {layer(geo.pitch, mats.pitch, 7, 'pitch')}
      {layer(geo.track, mats.pitch, 7, 'track')}
      {layer(geo.curb, mats.curb, 8, 'curb')}
      {layer(geo.road, mats.road, 9, 'road')}
      {layer(geo.busway, mats.busway, 9, 'busway')}
      {layer(geo.foot, mats.foot, 10, 'foot')}
      {layer(geo.cricket, mats.cricket, 11, 'cricket')}
      {layer(geo.pitchLines, mats.mark, 12, 'pitch-lines')}
      {layer(geo.bay, mats.bay, 12, 'bay-lines')}
      {layer(geo.centre, mats.lane, 12, 'centre-lines')}
      {borderPts && (
        <>
          <Line
            points={borderPts}
            color={EDGE.border}
            lineWidth={6}
            transparent
            opacity={0.12}
            depthWrite={false}
            fog={false}
            renderOrder={20}
          />
          <Line
            points={borderPts}
            color={EDGE.border}
            lineWidth={1.5}
            transparent
            opacity={phase === 'title' ? 0.75 : 0.6}
            depthWrite={false}
            fog={false}
            renderOrder={21}
          />
        </>
      )}
    </group>
  );
}

function parkingLines(segs: Vec2[][]): (THREE.BufferGeometry | null)[] {
  return segs.map((s) => ribbon(s, 0.12, LAYER.mark));
}

/** Boundary outline points lifted onto the optional terrain, densified so it follows slopes. */
function drapeLine(r: Vec2[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i],
      b = r[i + 1];
    const n = terrainActive()
      ? Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14))
      : 1;
    for (let k = 0; k < n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n,
        z = a[1] + ((b[1] - a[1]) * k) / n;
      out.push([x, 0.5 + groundY(x, z), z]);
    }
  }
  out.push([
    r[r.length - 1][0],
    0.5 + groundY(r[r.length - 1][0], r[r.length - 1][1]),
    r[r.length - 1][1],
  ]);
  return out;
}
