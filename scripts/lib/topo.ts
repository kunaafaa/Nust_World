/**
 * Read-only loader for TopoExport binary DXF files (AC1024). REFERENCE-ONLY data: used by scripts/topo-analyze.ts to
 * check our map. Files are opened as plain bytes and parsed as data; nothing in them is ever executed.
 */
import { readFileSync } from 'node:fs';
import type { Vec2 } from '../../src/lib/types';

export type Pair = [number, number | string];
export interface Ent {
  type: string;
  layer: string;
  g: Pair[];
}

function kind(c: number): 's' | 'd' | 'h' | 'i' | 'q' | 'b' | 'x' {
  if (c < 10) return 's';
  if (c < 60) return 'd';
  if (c < 80) return 'h';
  if (c < 100) return 'i';
  if (c < 110) return 's';
  if (c < 160) return 'd';
  if (c < 170) return 'q';
  if (c < 210) return 'h';
  if (c < 270) return 'd';
  if (c < 290) return 'h';
  if (c < 300) return 'b';
  if (c < 310) return 's';
  if (c < 320) return 'x';
  if (c < 370) return 's';
  if (c < 390) return 'h';
  if (c < 400) return 's';
  if (c < 410) return 'h';
  if (c < 420) return 's';
  if (c < 430) return 'i';
  if (c < 440) return 's';
  if (c < 460) return 'i';
  if (c < 470) return 'd';
  if (c < 482) return 's';
  if (c < 1010) return 's';
  if (c < 1060) return 'd';
  if (c < 1071) return 'h';
  if (c === 1071) return 'i';
  return 's';
}

export function parseBinaryDxf(path: string): {
  header: Record<string, Pair[]>;
  ents: Ent[];
  blocks: Record<string, Ent[]>;
} {
  const b = readFileSync(path);
  let p = 22; // "AutoCAD Binary DXF\r\n\x1a\0"
  const str = () => {
    let e = p;
    while (b[e] !== 0) e++;
    const s = b.toString('latin1', p, e);
    p = e + 1;
    return s;
  };
  const pairs: Pair[] = [];
  while (p < b.length) {
    const code = b.readInt16LE(p);
    p += 2;
    let v: number | string = 0;
    switch (kind(code)) {
      case 's':
        v = str();
        break;
      case 'd':
        v = b.readDoubleLE(p);
        p += 8;
        break;
      case 'h':
        v = b.readInt16LE(p);
        p += 2;
        break;
      case 'i':
        v = b.readInt32LE(p);
        p += 4;
        break;
      case 'q':
        v = Number(b.readBigInt64LE(p));
        p += 8;
        break;
      case 'b':
        v = b[p++];
        break;
      case 'x': {
        const n = b[p++];
        v = n;
        p += n;
        break;
      }
    }
    pairs.push([code, v]);
  }
  const header: Record<string, Pair[]> = {};
  const ents: Ent[] = [];
  const blocks: Record<string, Ent[]> = {};
  let blk: string | null = null;
  let sec = '',
    curVar = '',
    cur: Ent | null = null;
  for (const [c, v] of pairs) {
    if (c === 0 && v === 'SECTION') continue;
    if (c === 0 && v === 'ENDSEC') {
      if (cur) ents.push(cur);
      cur = null;
      sec = '';
      continue;
    }
    if (
      c === 2 &&
      sec === '' &&
      ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'].includes(v as string)
    ) {
      sec = v as string;
      continue;
    }
    if (sec === 'HEADER') {
      if (c === 9) {
        curVar = v as string;
        header[curVar] = [];
      } else if (curVar) header[curVar].push([c, v]);
    } else if (sec === 'BLOCKS') {
      if (c === 0) {
        if (cur && blk) blocks[blk].push(cur);
        cur = null;
        if (v === 'BLOCK') {
          blk = null;
          cur = { type: 'BLOCK', layer: '', g: [] };
        } else if (v === 'ENDBLK') {
          blk = null;
        } else if (blk) cur = { type: v as string, layer: '', g: [] };
      } else if (cur) {
        cur.g.push([c, v]);
        if (c === 8) cur.layer = v as string;
        if (cur.type === 'BLOCK' && c === 2) {
          blk = v as string;
          blocks[blk] = [];
          cur = null;
        }
      }
    } else if (sec === 'ENTITIES') {
      if (c === 0) {
        if (cur) ents.push(cur);
        cur = { type: v as string, layer: '', g: [] };
      } else if (cur) {
        cur.g.push([c, v]);
        if (c === 8) cur.layer = v as string;
      }
    }
  }
  return { header, ents, blocks };
}

export const nums = (e: Ent, code: number) =>
  e.g.filter((x) => x[0] === code).map((x) => x[1] as number);
export const text = (e: Ent) => (e.g.find((x) => x[0] === 1)?.[1] as string | undefined) ?? '';

/** LWPOLYLINE vertices as local metres (x east, y north). */
export function lwVerts(e: Ent): { pts: Vec2[]; closed: boolean } {
  const pts: Vec2[] = [];
  let x: number | null = null;
  for (const [c, v] of e.g) {
    if (c === 10) x = v as number;
    else if (c === 20 && x !== null) {
      pts.push([x, v as number]);
      x = null;
    }
  }
  const flag = (e.g.find((q) => q[0] === 70)?.[1] as number | undefined) ?? 0;
  return { pts, closed: (flag & 1) === 1 };
}

/** All (x, y, z) vertices of a MESH or POLYLINE-VERTEX entity. */
export function xyz(e: Ent): [number, number, number][] {
  const out: [number, number, number][] = [];
  let x = 0,
    y = 0;
  for (const [c, v] of e.g) {
    if (c === 10) x = v as number;
    else if (c === 20) y = v as number;
    else if (c === 30) out.push([x, y, v as number]);
  }
  return out;
}

export interface TopoBuilding {
  ring: Vec2[];
  height?: number;
  area?: number;
}
export interface Topo {
  name: string;
  folder: string;
  header: Record<string, Pair[]>;
  extent: [number, number];
  layers: Record<string, Record<string, number>>;
  buildings: TopoBuilding[];
  roads: Vec2[][];
  green: Vec2[][];
  water: Vec2[][];
  contours: { z: number; pts: Vec2[] }[];
  /** building base/top elevations from the 3D file: matched to 2D buildings by centroid */
  bld3d: { c: Vec2; zmin: number; zmax: number }[];
  /** terrain vertices (x, y, z) from the terrain mesh */
  terrain: [number, number, number][];
  trees: number;
}

export function loadTopo(folder: string, name: string): Topo {
  const two = parseBinaryDxf(`${folder}/topoexport_2D_vectorial.dxf`);
  const three = parseBinaryDxf(`${folder}/topoexport_3D_modeling.dxf`);
  const layers: Topo['layers'] = {};
  for (const e of [...two.ents, ...three.ents])
    (layers[e.layer] ??= {})[e.type] = (layers[e.layer][e.type] || 0) + 1;
  const ext = lwVerts(two.ents.find((e) => e.layer === 'TPX_FRAME_PROJECT')!).pts;
  const extent: [number, number] = [
    Math.max(...ext.map((p) => p[0])),
    Math.max(...ext.map((p) => p[1])),
  ];

  const polys = (layer: string) =>
    two.ents.filter((e) => e.layer === layer && e.type === 'LWPOLYLINE').map(lwVerts);
  const bPolys = two.ents
    .filter((e) => e.layer === 'TPX_BUILDINGS' && e.type === 'LWPOLYLINE')
    .map((e) => lwVerts(e).pts);
  const hTexts = two.ents
    .filter((e) => e.layer === 'TPX_BUILDING_HEIGHTS_TEXT')
    .map((e) => ({
      x: nums(e, 10)[0],
      y: nums(e, 20)[0],
      h: parseFloat(text(e).replace(/[^0-9.]/g, '')),
    }));
  const aTexts = two.ents
    .filter((e) => e.layer === 'TPX_BUILDING_AREAS_TEXT')
    .map((e) => ({
      x: nums(e, 10)[0],
      y: nums(e, 20)[0],
      a: parseFloat(text(e).replace(/[^0-9.]/g, '')),
    }));
  const buildings: TopoBuilding[] = bPolys.map((ring) => {
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length,
      cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const near = <T extends { x: number; y: number }>(a: T[]) =>
      a.reduce<T | null>(
        (b, t) => (!b || Math.hypot(t.x - cx, t.y - cy) < Math.hypot(b.x - cx, b.y - cy) ? t : b),
        null,
      );
    const h = near(hTexts),
      a = near(aTexts);
    return {
      ring,
      height: h && Math.hypot(h.x - cx, h.y - cy) < 30 ? h.h : undefined,
      area: a && Math.hypot(a.x - cx, a.y - cy) < 30 ? a.a : undefined,
    };
  });

  // 3D: per-building mesh elevation range, contour z, terrain vertices.
  const bld3d = three.ents
    .filter((e) => e.layer === 'TPX_BUILDINGS' && e.type === 'MESH')
    .map((e) => {
      const v = xyz(e);
      return {
        c: [
          v.reduce((s, p) => s + p[0], 0) / v.length,
          v.reduce((s, p) => s + p[1], 0) / v.length,
        ] as Vec2,
        zmin: Math.min(...v.map((p) => p[2])),
        zmax: Math.max(...v.map((p) => p[2])),
      };
    });
  const contours: Topo['contours'] = [];
  let cur: { z: number; pts: Vec2[] } | null = null;
  for (const e of three.ents) {
    if (e.layer !== 'TPX_TERRAIN_CONTOUR_LINES') continue;
    if (e.type === 'POLYLINE') {
      if (cur) contours.push(cur);
      cur = { z: NaN, pts: [] };
    } else if (e.type === 'VERTEX' && cur) {
      const [v] = xyz(e);
      if (v) {
        cur.pts.push([v[0], v[1]]);
        cur.z = v[2];
      }
    }
  }
  if (cur) contours.push(cur);
  const tm = three.ents.find((e) => e.layer === 'TPX_TERRAIN_TERRAIN_MESH' && e.type === 'MESH');
  return {
    name,
    folder,
    header: two.header,
    extent,
    layers,
    buildings,
    roads: polys('TPX_ROADS_AXES').map((p) => p.pts),
    green: polys('TPX_VEGETATION_GREEN_SPACES').map((p) => p.pts),
    water: polys('TPX_WATERWAYS').map((p) => p.pts),
    contours,
    bld3d,
    terrain: tm ? xyz(tm) : [],
    trees: two.ents.filter((e) => e.layer === 'TPX_VEGETATION_TREES_INDIVIDUAL').length,
  };
}
