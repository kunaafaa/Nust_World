/**
 * Optional terrain (default OFF). Heightmap built by scripts/build-topo-merge.ts from the 5 m contours of the
 * TopoExport files, whose source is the OpenGeoHub EDTM 30 m model (CC BY 4.0). It is a coarse, smoothed surface
 * (about ±1.5 m against its own source), so it shows the broad slope of the campus, not small features.
 *
 * `groundY(x, z)` is the height in metres above the flat ground plane, relative to the elevation at the scene origin.
 * It returns 0 whenever terrain is off, so every caller can add it unconditionally and the flat map is unchanged.
 */
import type { Vec2 } from './types';

export interface TerrainFile {
  version: 1;
  source: string;
  x0: number;
  z0: number;
  cell: number;
  cols: number;
  rows: number;
  zRefElevation: number;
  minElevation: number;
  maxElevation: number;
  /** row-major, metres relative to zRefElevation */
  values: number[];
}

export class Terrain {
  constructor(readonly f: TerrainFile) {}
  /** Bilinear height (m, relative to the scene origin's elevation). Clamped at the edges of the grid. */
  heightAt(x: number, z: number): number {
    const { x0, z0, cell, cols, rows, values } = this.f;
    const fx = Math.min(cols - 1.001, Math.max(0, (x - x0) / cell));
    const fz = Math.min(rows - 1.001, Math.max(0, (z - z0) / cell));
    const c = Math.floor(fx),
      r = Math.floor(fz),
      tx = fx - c,
      tz = fz - r;
    const v = (rr: number, cc: number) => values[rr * cols + cc];
    return (
      v(r, c) * (1 - tx) * (1 - tz) +
      v(r, c + 1) * tx * (1 - tz) +
      v(r + 1, c) * (1 - tx) * tz +
      v(r + 1, c + 1) * tx * tz
    );
  }
  get min() {
    return this.f.minElevation - this.f.zRefElevation;
  }
  get max() {
    return this.f.maxElevation - this.f.zRefElevation;
  }
  /** Scene-space extent of the grid */
  get box(): [number, number, number, number] {
    const { x0, z0, cell, cols, rows } = this.f;
    return [x0, z0, x0 + (cols - 1) * cell, z0 + (rows - 1) * cell];
  }
}

let current: Terrain | null = null;
let enabled = false;

export function setTerrain(t: Terrain | null, on: boolean) {
  current = t;
  enabled = on && !!t;
}
export const terrainActive = () => enabled;
export const groundY = (x: number, z: number): number =>
  enabled && current ? current.heightAt(x, z) : 0;

/** Length of a path in metres including the climb, so an uphill walk counts as longer. Flat when terrain is off. */
export function pathLength3d(pts: Vec2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0],
      dz = pts[i][1] - pts[i - 1][1];
    const dy = groundY(pts[i][0], pts[i][1]) - groundY(pts[i - 1][0], pts[i - 1][1]);
    L += Math.hypot(dx, dz, dy);
  }
  return L;
}
