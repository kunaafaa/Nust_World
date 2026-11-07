import * as THREE from 'three';

/** Uniforms shared by every material so a single write drives day/night + animation. */
export const sharedUniforms = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

/**
 * Building material: vertex-coloured, flat-ish stylised standard material with a procedural
 * window grid (no extra geometry). Windows tint blue by day and glow warm at night.
 */
export function createBuildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = sharedUniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos; varying vec3 vWN; uniform float uNight;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float winMask;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float wall = 1.0 - smoothstep(0.2, 0.4, abs(vWN.y));
  float along = dot(vWPos.xz, vec2(-vWN.z, vWN.x));
  vec2 cell = vec2(along / 3.2, vWPos.y / 3.4);
  vec2 f = fract(cell);
  float m = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.78);
  winMask = m * wall * step(1.5, vWPos.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.45, 0.58), winMask * 0.7);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec2 id = floor(vec2(dot(vWPos.xz, vec2(-vWN.z, vWN.x)) / 3.2, vWPos.y / 3.4));
  float on = step(0.4, h21(id + floor(vWPos.xz * 0.01)));
  totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * winMask * on * uNight * 1.6;
}`,
      );
  };
  return mat;
}

export const flat = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...opts });
