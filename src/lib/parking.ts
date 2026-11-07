import { orientedBox, pointInPolygon } from './geo';
import type { Vec2 } from './types';

export interface Bay {
  x: number;
  z: number;
  /** heading of a parked car (nose direction), radians */ angle: number;
}
export interface BayLayout {
  bays: Bay[];
  lines: Vec2[][];
}

const BAY_W = 2.6; // across
const BAY_D = 5.0; // deep
const AISLE = 6.0;

/**
 * Lay out parking bays inside a lot: double rows of bays separated by aisles, aligned to the lot's long axis.
 * `blocked` rejects bays that touch buildings/water/roads. Returns the bay centres and the white bay-line segments.
 */
export function layoutBays(
  rings: Vec2[][],
  blocked: (p: Vec2) => boolean = () => false,
): BayLayout {
  const box = orientedBox(rings[0]);
  if (box.length < BAY_D * 2 || box.width < BAY_W * 2) return { bays: [], lines: [] };
  const ca = Math.cos(box.angle),
    sa = Math.sin(box.angle);
  const toWorld = (u: number, v: number): Vec2 => [
    box.cx + u * ca - v * sa,
    box.cz + u * sa + v * ca,
  ];
  // Bays run in rows along the long axis (u); depth is across it (v).
  const bays: Bay[] = [];
  const lines: Vec2[][] = [];
  const pitch = BAY_D * 2 + AISLE;
  const ok = (u: number, v: number) => {
    const corners: Vec2[] = [
      toWorld(u - BAY_W / 2, v - BAY_D / 2),
      toWorld(u + BAY_W / 2, v - BAY_D / 2),
      toWorld(u + BAY_W / 2, v + BAY_D / 2),
      toWorld(u - BAY_W / 2, v + BAY_D / 2),
    ];
    return corners.every((c) => pointInPolygon(c, rings) && !blocked(c)) && !blocked(toWorld(u, v));
  };
  for (
    let v0 = -box.width / 2 + 0.5;
    v0 + BAY_D * 2 <= box.width / 2 + 0.01 || v0 + BAY_D <= box.width / 2;
    v0 += pitch
  ) {
    for (const rowOffset of [BAY_D / 2, BAY_D * 1.5]) {
      const v = v0 + rowOffset;
      if (v + BAY_D / 2 > box.width / 2) continue;
      const faceUp = rowOffset < BAY_D;
      for (let u = -box.length / 2 + BAY_W / 2 + 0.5; u + BAY_W / 2 <= box.length / 2; u += BAY_W) {
        if (!ok(u, v)) continue;
        const [x, z] = toWorld(u, v);
        bays.push({ x, z, angle: box.angle + Math.PI / 2 + (faceUp ? 0 : Math.PI) });
        const a = toWorld(u - BAY_W / 2, v - BAY_D / 2),
          b = toWorld(u - BAY_W / 2, v + BAY_D / 2);
        lines.push([a, b]);
      }
    }
  }
  return { bays, lines };
}
