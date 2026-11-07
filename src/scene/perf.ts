/** Live render statistics + pointer ground position, written by probes inside the Canvas and read by the debug HUD. */
export const perf = {
  fps: 0,
  calls: 0,
  triangles: 0,
  instances: 0,
  trees: 0,
  cars: 0,
  /** Ground point under the pointer, in scene metres, or null */
  cursor: null as [number, number] | null,
};
