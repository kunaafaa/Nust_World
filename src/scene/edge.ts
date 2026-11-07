import * as THREE from 'three';
import { SDF_MAX, SDF_MIN, buildSdf } from '@/lib/boundary';
import type { Vec2 } from '@/lib/types';
import { COL, EDGE } from './theme';

/** Shared uniforms: the campus-boundary signed-distance texture. Until a boundary loads, edgeOn stays 0 (no fade). */
export const edgeUniforms = {
  uEdgeTex: { value: null as THREE.DataTexture | null },
  uEdgeBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  uEdgeOn: { value: 0 },
  uEdgeBase: { value: new THREE.Color(COL.base) },
};

let tex: THREE.DataTexture | null = null;
export function setEdgeField(ring: Vec2[] | null) {
  tex?.dispose();
  tex = null;
  if (!ring) {
    edgeUniforms.uEdgeOn.value = 0;
    return;
  }
  const s = buildSdf(ring);
  tex = new THREE.DataTexture(s.data, s.size, s.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  edgeUniforms.uEdgeTex.value = tex;
  edgeUniforms.uEdgeBox.value.set(s.x0, s.z0, s.w, s.h);
  edgeUniforms.uEdgeOn.value = 1;
}

export type EdgeKind = 'ground' | 'road' | 'context' | 'marsh';

const B = EDGE.groundBuffer.toFixed(1);
const R = EDGE.roadFade.toFixed(1);
const C = EDGE.contextRange.toFixed(1);
// d = metres inside the boundary (negative outside). Each kind returns 1 (fully drawn) .. 0 (dissolved into the dark base).
const FADE: Record<EdgeKind, string> = {
  ground: `smoothstep(-${B}, 0.0, d)`,
  marsh: `smoothstep(-${B}, 0.0, d)`,
  road: `smoothstep(-${B}, ${(EDGE.roadFade - EDGE.groundBuffer).toFixed(1)}, d)`,
  context: `(1.0 - smoothstep(-15.0, 15.0, d)) * smoothstep(-${C}, -${R}, d)`,
};

/**
 * Patches a standard material so its colour dissolves into the base ground colour near and beyond the campus boundary.
 * Colour is mixed (not alpha-blended), so there is no sorting or depth trouble and the edge shows no straight cut.
 */
export function edgeFade<T extends THREE.Material>(mat: T, kind: EdgeKind): T {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, edgeUniforms);
    if (kind === 'marsh') {
      sh.uniforms.uMarsh = { value: new THREE.Color(EDGE.marsh) };
      sh.uniforms.uMarshDot = { value: new THREE.Color(EDGE.marshDot) };
    }
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec2 vEdgeP;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vEdgeP = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        'void main() {',
        `varying vec2 vEdgeP;
uniform sampler2D uEdgeTex; uniform vec4 uEdgeBox; uniform float uEdgeOn; uniform vec3 uEdgeBase;
${kind === 'marsh' ? 'uniform vec3 uMarsh; uniform vec3 uMarshDot;' : ''}
void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float eF = 1.0;
  if (uEdgeOn > 0.5) {
    float d = texture2D(uEdgeTex, (vEdgeP - uEdgeBox.xy) / uEdgeBox.zw).r * ${(SDF_MAX - SDF_MIN).toFixed(1)} + ${SDF_MIN.toFixed(1)};
    eF = clamp(${FADE[kind]}, 0.0, 1.0);
  }
  ${
    kind === 'marsh'
      ? `vec2 mg = fract(vEdgeP / 5.0) - 0.5; float mdot = smoothstep(0.15, 0.1, length(mg));
  diffuseColor.rgb = mix(uMarsh, uMarshDot, mdot * 0.4);`
      : kind === 'context'
        ? 'diffuseColor.rgb = diffuseColor.rgb;'
        : ''
  }
  diffuseColor.rgb = mix(uEdgeBase, diffuseColor.rgb, eF);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= eF;',
      );
  };
  mat.customProgramCacheKey = () => `edge-${kind}`;
  return mat;
}
