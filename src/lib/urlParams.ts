/**
 * The only place the app reads its URL query. Every parameter is checked against an allow-list or a numeric range;
 * anything else is ignored. Values are used as data (ids, numbers, flags), never rendered as HTML.
 *
 * Developer tools (?debug, ?simulate, ?perf, ?shots, ?reviews=memory, ?topo=off, ?edge=off) only work while
 * NEXT_PUBLIC_DEV_TOOLS is on. It is on unless set to 0 or false (see .env.example and README "Environment").
 */

const off = (v: string | undefined) => v === '0' || v === 'false';
/** Build-time switch for the developer tools. Default on for now; set NEXT_PUBLIC_DEV_TOOLS=0 to remove them. */
export const DEV_TOOLS = !off(process.env.NEXT_PUBLIC_DEV_TOOLS);

/** Place ids look like `concordia-1-6900` or `prov-razi-hostel` (same rule as the reviews table). */
export const PLACE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** ?simulate=gate1 (any gate number), or a bare ?simulate for the first gate */
const SIM_NAME = /^(gate\d{1,2}|1|)$/i;

export interface UrlParams {
  /** place to open (an id; App checks it exists) */
  place: string | null;
  /** route deep-link ends; today they only skip the title fly-over */
  from: string | null;
  to: string | null;
  /** ?flat=1: 2D map */
  flat: boolean;
  /** ?low=1: low graphics tier */
  low: boolean;
  /** ?terrain=1: optional terrain on */
  terrain: boolean;

  // developer tools: always false / null when DEV_TOOLS is off
  debug: boolean;
  perf: boolean;
  /** ?shots: window.__nwFly for scripted screenshots */
  shots: boolean;
  /** ?simulate=gate1: fake GPS at a gate. '' (bare ?simulate) exposes the test handles without faking GPS. */
  simulate: string | null;
  /** &walk=1: the simulated walker follows the route */
  walk: boolean;
  /** &walkSpeed=6: metres per second, 0.1 to 50 (default 1.4) */
  walkSpeed: number;
  /** &simHz=4: simulated fixes per second, 1 to 10 (default 1) */
  simHz: number;
  /** ?reviews=memory: in-browser demo review store */
  reviewsMemory: boolean;
  /** ?topo=off: OSM only, without the Overture merge */
  topoOff: boolean;
  /** ?edge=off: old hard-cut edge, for comparison */
  edgeOff: boolean;
}

function num(v: string | null, min: number, max: number, fallback: number): number {
  if (v == null || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
const id = (v: string | null) => (v != null && PLACE_ID.test(v) ? v : null);

export function parseUrlParams(search: string, devTools = DEV_TOOLS): UrlParams {
  const q = new URLSearchParams(search);
  const dev = (on: boolean) => devTools && on;
  const sim = q.get('simulate');
  return {
    place: id(q.get('place')),
    from: id(q.get('from')),
    to: id(q.get('to')),
    flat: q.get('flat') === '1',
    low: q.get('low') === '1',
    terrain: q.get('terrain') === '1',
    debug: dev(q.get('debug') === '1'),
    perf: dev(q.get('perf') === '1'),
    shots: dev(q.has('shots')),
    simulate: devTools && sim != null && SIM_NAME.test(sim) ? sim.toLowerCase() : null,
    walk: dev(q.get('walk') === '1'),
    walkSpeed: num(q.get('walkSpeed'), 0.1, 50, 1.4),
    simHz: num(q.get('simHz'), 1, 10, 1),
    reviewsMemory: dev(q.get('reviews') === 'memory'),
    topoOff: dev(q.get('topo') === 'off'),
    edgeOff: dev(q.get('edge') === 'off'),
  };
}

/** The current page's parameters (empty on the server). */
export function urlParams(): UrlParams {
  return parseUrlParams(typeof location === 'undefined' ? '' : location.search);
}
