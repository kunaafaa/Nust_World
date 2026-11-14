import type { Vec2 } from './types';

/**
 * Imperative navigation state shared by the location pipeline, the camera controller, the user dot and the route
 * shader. Written and read every frame without React: nothing here triggers a re-render.
 */
export const navRuntime = {
  /** Latest accepted position (scene metres), updated at most 10 times a second */
  target: null as Vec2 | null,
  /** Position the dot is drawn at: low-pass towards `target`, written by the dot each frame */
  shown: null as Vec2 | null,
  accuracy: 20,
  /** Compass heading in degrees (0 = north), or null */
  heading: null as number | null,
  /** Metres along the active route, and the current step's start/end (for the route shader) */
  progressM: 0,
  stepFromM: 0,
  stepToM: 0,
  /** Last time the user touched the map (ms, performance.now) */
  lastTouch: 0,
  /** Last reroute request (ms, Date.now) */
  lastRerouteAt: 0,
  /** True while the dot or the camera is still moving: the scene renders at full rate only then */
  moving: false,
};

export function resetNavRuntime() {
  navRuntime.target = null;
  navRuntime.shown = null;
  navRuntime.progressM = 0;
  navRuntime.stepFromM = 0;
  navRuntime.stepToM = 0;
  navRuntime.lastRerouteAt = 0;
  navRuntime.moving = false;
}
