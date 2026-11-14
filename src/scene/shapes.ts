import * as THREE from 'three';
import { centroid, orientedBox, pointInPolygon } from '@/lib/geo';
import type { BuildingShape, Vec2 } from '@/lib/types';

/** Walls: footprint (with holes) extruded to `height`, base at y = 0. */
export function extrudeWalls(
  footprint: Vec2[],
  holes: Vec2[][],
  height: number,
): THREE.BufferGeometry | null {
  if (footprint.length < 3) return null;
  try {
    const shape = new THREE.Shape(footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes)
      if (h.length >= 3)
        shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1.5, height),
      bevelEnabled: false,
      steps: 1,
      curveSegments: 3,
    });
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    return g;
  } catch {
    return null;
  }
}

/** Local frame of a building: x along the long axis, z across, origin at the oriented-box centre. */
function frame(ring: Vec2[]) {
  const b = orientedBox(ring);
  const m = new THREE.Matrix4().makeRotationY(-b.angle).setPosition(b.cx, 0, b.cz);
  return { b, m };
}
const placed = (g: THREE.BufferGeometry, m: THREE.Matrix4) => {
  g.applyMatrix4(m);
  g.deleteAttribute('uv');
  return g;
};

function dome(rx: number, rz: number, ry: number, y: number, x = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

/** Half-cylinder vault with its axis along local X. Spans `w` across, rises `rise`, runs `len` long. */
function vault(len: number, w: number, rise: number, y: number, zc = 0): THREE.BufferGeometry[] {
  const body = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, 0, Math.PI);
  body.rotateZ(Math.PI / 2);
  body.scale(len, rise, w / 2);
  body.translate(0, y, zc);
  const caps = [-1, 1].map((s) => {
    const c = new THREE.CircleGeometry(1, 16, 0, Math.PI);
    c.rotateY(Math.PI / 2);
    c.scale(1, rise, w / 2);
    c.translate((s * len) / 2, y, zc);
    return c;
  });
  return [body, ...caps];
}

function gable(len: number, w: number, rise: number, y: number): THREE.BufferGeometry {
  const s = new THREE.Shape([
    new THREE.Vector2(-w / 2, 0),
    new THREE.Vector2(w / 2, 0),
    new THREE.Vector2(0, rise),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Extra roof / landmark geometry stacked on the walls. Every geometry is returned in world coordinates. */
export function roofParts(b: BuildingShape): THREE.BufferGeometry[] {
  const roof = b.roofType ?? 'flat';
  if (roof === 'flat') return [];
  const { b: box, m } = frame(b.footprint);
  const L = box.length,
    W = box.width,
    y = b.height;
  const out: THREE.BufferGeometry[] = [];
  const small = Math.min(L, W);
  switch (roof) {
    case 'dome':
      out.push(dome(L * 0.46, W * 0.46, small * 0.3, y));
      break;
    case 'dome-center': {
      const r = small * 0.26;
      const drum = new THREE.CylinderGeometry(r, r, 3.2, 20, 1, true);
      drum.translate(0, y + 1.6, 0);
      out.push(drum, dome(r, r, r * 0.9, y + 3.2));
      break;
    }
    case 'barrel-vault': {
      // Two parallel vaults across the width (squash court / pool / gym halls).
      const vw = W / 2;
      out.push(...vault(L, vw, vw * 0.38, y, -vw / 2), ...vault(L, vw, vw * 0.38, y, vw / 2));
      break;
    }
    case 'gabled':
      out.push(gable(L, W, W * 0.25, y));
      break;
    case 'hostel-template':
      return hostelTemplateParts(b);
  }
  return out.map((g) => placed(g, m));
}

/**
 * Hostel template decoration (approximate, unverified): on top of the real, unsimplified footprint add
 *  - a curved canopy on 4 columns just outside the entrance bay (the edge facing the loop driveway), and
 *  - a half-cylinder drum with a row of small square vents on the roof just inside that bay.
 * Needs `b.entrance`; without it only the plain flat-roofed footprint is drawn. Geometry is in world coordinates.
 */
export function hostelTemplateParts(b: BuildingShape): THREE.BufferGeometry[] {
  const e = b.entrance;
  if (!e || b.footprint.length < 4) return [];
  const [cx, cz] = centroid(b.footprint);
  let ux = e[0] - cx,
    uz = e[1] - cz;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul;
  uz /= ul;
  // local frame: x along the entrance edge, z pointing out of the building, origin at the entrance point
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-uz, 0, ux),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(ux, 0, uz),
  );
  const at = (dz: number) => basis.clone().setPosition(e[0] + ux * dz, 0, e[1] + uz * dz);
  const out: THREE.BufferGeometry[] = [];
  const canopyH = 3.4;
  // canopy: 4 columns + a shallow curved shell, 7 m wide, reaching 4.5 m out from the wall
  const cm = at(0);
  for (const [x, z] of [
    [-3, 0.8],
    [3, 0.8],
    [-3, 4.2],
    [3, 4.2],
  ]) {
    const c = new THREE.CylinderGeometry(0.18, 0.2, canopyH, 8);
    c.translate(x, canopyH / 2, z);
    out.push(placed(c, cm));
  }
  for (const g of vault(7.2, 4.8, 0.7, canopyH, 2.5)) out.push(placed(g, cm));
  // drum on the roof 6 m inside the bay, only if that point is really on this roof
  const din = 6;
  const dp: Vec2 = [e[0] - ux * din, e[1] - uz * din];
  if (pointInPolygon(dp, [b.footprint])) {
    const dm = at(-din);
    const y = b.height;
    for (const g of vault(7, 3.6, 1.6, y)) out.push(placed(g, dm));
    for (let i = 0; i < 5; i++) {
      const v = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      v.translate(-2.4 + i * 1.2, y + 1.6 + 0.25, 0);
      out.push(placed(v, dm));
    }
  }
  return out;
}

/** Main Office: columned portico on the long face, central drum + dome, lower wings. Stylised, not surveyed. */
export function mainOfficeParts(b: BuildingShape): THREE.BufferGeometry[] {
  const { b: box, m } = frame(b.footprint);
  const L = box.length,
    W = box.width,
    y = b.height;
  const out: THREE.BufferGeometry[] = [];
  const cols = 6,
    span = Math.min(L * 0.4, 24);
  for (let i = 0; i < cols; i++) {
    const c = new THREE.CylinderGeometry(0.45, 0.5, y * 0.85, 8);
    c.translate(-span / 2 + (i * span) / (cols - 1), y * 0.425, W / 2 + 2.2);
    out.push(c);
  }
  const roof = new THREE.BoxGeometry(span + 2, 0.6, 4.4);
  roof.translate(0, y * 0.85 + 0.3, W / 2 + 2.2);
  out.push(roof);
  const r = Math.min(L, W) * 0.2;
  const drum = new THREE.CylinderGeometry(r, r, 4, 24, 1, true);
  drum.translate(0, y + 2, 0);
  out.push(drum, dome(r, r, r * 0.95, y + 4));
  return out.map((g) => placed(g.index ? g.toNonIndexed() : g, m));
}

export const LANDMARK_SHAPES: Record<number, (b: BuildingShape) => THREE.BufferGeometry[]> = {
  209141896: mainOfficeParts,
};
