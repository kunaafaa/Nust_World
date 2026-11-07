import type * as THREE from 'three';

/** Camera handle shared with DOM overlays (labels, minimap) so they can project world points. */
export const viewApi: { camera: THREE.Camera | null; width: number; height: number } = {
  camera: null,
  width: 1,
  height: 1,
};
