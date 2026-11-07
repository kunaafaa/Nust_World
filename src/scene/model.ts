import { buildObstacles, scatterParkedCars, scatterTrees, type Obstacles } from '@/lib/scatter';
import type { CampusData } from '@/lib/types';

export interface SceneModel {
  obstacles: Obstacles;
  trees: ReturnType<typeof scatterTrees>;
  parked: ReturnType<typeof scatterParkedCars>;
}
const cache = new WeakMap<CampusData, SceneModel>();
/** Derived placement data (trees, parked cars, bay lines), computed once per dataset. */
export function sceneModel(data: CampusData): SceneModel {
  let m = cache.get(data);
  if (!m) {
    const obstacles = buildObstacles(data);
    m = {
      obstacles,
      trees: scatterTrees(data, obstacles),
      parked: scatterParkedCars(data, obstacles),
    };
    cache.set(data, m);
  }
  return m;
}
