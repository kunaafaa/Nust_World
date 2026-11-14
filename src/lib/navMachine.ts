/**
 * Navigation state machine. Pure: no React, no three.js, no timers. The app feeds it events and runs the effects.
 *
 *   IDLE ── destination chosen ──> ROUTE_PREVIEW ── Start ──> NAV_FOLLOW <── re-centre / idle timeout ── NAV_FREE
 *                                       │                        │  └── pan / rotate gesture ──────────────> ┘
 *                                       │                        └── within ARRIVE_M of the entrance ──> ARRIVED ──> IDLE
 *   any state ── end (x) ──> IDLE (restores the camera tilt the user had before navigating)
 *
 * Pinch-zoom in NAV_FOLLOW only changes the zoom; it never leaves NAV_FOLLOW.
 */
import { ARRIVE_M, REROUTE_M } from './location';

export type NavState = 'IDLE' | 'ROUTE_PREVIEW' | 'NAV_FOLLOW' | 'NAV_FREE' | 'ARRIVED';

export type NavEvent =
  | { type: 'DESTINATION' }
  | { type: 'START' }
  | { type: 'GESTURE'; kind: 'pan' | 'rotate' | 'pinch' }
  | { type: 'RECENTRE' }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'FIX'; toDestM: number }
  | { type: 'ARRIVED_DONE' }
  | { type: 'END' };

export type NavEffect =
  'fitRoute' | 'enterFollow' | 'flyToUser' | 'arrived' | 'showDestinationCard' | 'restoreCamera';

export interface NavResult {
  state: NavState;
  effects: NavEffect[];
}

export const REROUTE_EVERY_MS = 3000;
export { ARRIVE_M, REROUTE_M };

export const isNavigating = (s: NavState) => s === 'NAV_FOLLOW' || s === 'NAV_FREE';

export function navReduce(state: NavState, ev: NavEvent): NavResult {
  const to = (s: NavState, ...effects: NavEffect[]): NavResult => ({ state: s, effects });
  const stay: NavResult = { state, effects: [] };
  if (ev.type === 'END') return state === 'IDLE' ? stay : to('IDLE', 'restoreCamera');
  switch (state) {
    case 'IDLE':
    case 'ARRIVED':
      if (ev.type === 'DESTINATION') return to('ROUTE_PREVIEW', 'fitRoute');
      if (state === 'ARRIVED' && ev.type === 'ARRIVED_DONE')
        return to('IDLE', 'restoreCamera', 'showDestinationCard');
      return stay;
    case 'ROUTE_PREVIEW':
      if (ev.type === 'DESTINATION') return to('ROUTE_PREVIEW', 'fitRoute');
      if (ev.type === 'START') return to('NAV_FOLLOW', 'enterFollow');
      return stay;
    case 'NAV_FOLLOW':
      if (ev.type === 'GESTURE') return ev.kind === 'pinch' ? stay : to('NAV_FREE');
      if (ev.type === 'FIX' && ev.toDestM <= ARRIVE_M) return to('ARRIVED', 'arrived');
      return stay;
    case 'NAV_FREE':
      if (ev.type === 'RECENTRE' || ev.type === 'IDLE_TIMEOUT')
        return to('NAV_FOLLOW', 'flyToUser');
      if (ev.type === 'FIX' && ev.toDestM <= ARRIVE_M) return to('ARRIVED', 'arrived');
      return stay;
  }
}

/** Reroute only when the user is more than REROUTE_M off the path, and at most once every REROUTE_EVERY_MS. */
export function shouldReroute(offPathM: number, lastRerouteAt: number, now: number): boolean {
  return offPathM > REROUTE_M && now - lastRerouteAt >= REROUTE_EVERY_MS;
}

/** Cumulative distance (m) at each vertex of a path. */
export function cumulative(path: [number, number][]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++)
    cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return cum;
}

/** Closest point on a path: distance along it (m), distance off it (m) and the segment index. */
export function projectOnPath(
  path: [number, number][],
  cum: number[],
  p: [number, number],
): { along: number; off: number; seg: number } {
  let best = { along: 0, off: Infinity, seg: 0 };
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1],
      [bx, bz] = path[i];
    const dx = bx - ax,
      dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2)) : 0;
    const off = Math.hypot(p[0] - ax - t * dx, p[1] - az - t * dz);
    if (off < best.off) best = { along: cum[i - 1] + t * Math.sqrt(l2), off, seg: i - 1 };
  }
  return best;
}

/** Index of the step the user is on, given step start distances (m along the path) and progress. */
export function currentStep(stepAt: number[], along: number): number {
  let k = 0;
  for (let i = 0; i < stepAt.length; i++) if (stepAt[i] <= along + 1) k = i;
  return Math.min(k + 1, stepAt.length - 1);
}

/** Frame-rate independent exponential damping factor: fraction of the gap to close this frame. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

/** Auto re-centre choices (seconds). 0 = off. */
export const AUTO_RECENTRE_CHOICES = [0, 5, 8, 12, 20, 30] as const;
export const AUTO_RECENTRE_DEFAULT = 12;
