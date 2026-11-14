import { create } from 'zustand';
import type { CampusData, Category, Vec2 } from '@/lib/types';
import type { RouteResult } from '@/lib/routing';
import { sfx } from '@/lib/sfx';
import { setTerrain, type Terrain } from '@/lib/terrain';
import type { TopoReport } from '@/lib/topoMerge';
import { AUTO_RECENTRE_CHOICES, AUTO_RECENTRE_DEFAULT, type NavState } from '@/lib/navMachine';

export type Phase = 'loading' | 'title' | 'explore';
export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Tier = 'low' | 'medium' | 'high';

/** approx: no verified entrance, so the route ends at the nearest footpath point */
export interface Endpoint {
  id?: string;
  name: string;
  pos: Vec2;
  approx?: boolean;
}

/** Small, non-blocking status chips under the search pill (never a modal). */
export type ChipKind = 'locationOff' | 'pickStart' | 'weakGps' | 'offCampus';
export interface Chip {
  kind: ChipKind;
  text: string;
  /** Still unresolved: the chip stays until resolved or dismissed (otherwise it hides after 5 s) */
  sticky?: boolean;
  /** Label of the action button, if any (e.g. "change") */
  action?: string;
}

interface AppState {
  /** Navigation state machine (src/lib/navMachine.ts) */
  nav: NavState;
  /** Camera tilt the user had before navigation started (restored when it ends) */
  navPrevTopDown: boolean | null;
  /** Current step index during navigation (changes only when the step changes) */
  navStep: number;
  /** Seconds without touching the map before NAV_FREE returns to NAV_FOLLOW; 0 = off */
  autoRecentreS: number;
  /** Navigation camera: rotate with the compass instead of north up */
  headingUp: boolean;
  chips: Chip[];
  setChip: (c: Chip | null, kind?: ChipKind) => void;
  /** The compact inline search for the route's starting point */
  startPickerOpen: boolean;
  phase: Phase;
  progress: number;
  data: CampusData | null;
  selectedId: string | null;
  category: Category | null;
  night: boolean;
  topDown: boolean;
  quality: Quality;
  effectiveLow: boolean; // result of auto-scaling or manual low
  /** Tier chosen by the first-seconds fps probe (used while quality is 'auto') */
  autoTier: Tier;
  /** User is dragging/zooming the map (chips hide while true) */
  interacting: boolean;
  showClouds: boolean;
  /** Visible height in px of the open bottom sheet (0 = none) */
  sheetPx: number;
  perfOn: boolean;
  /** Place card sheet snap */
  cardSnap: 'peek' | 'half' | 'full';
  navSnap: 'peek' | 'half' | 'full';
  searchOpen: boolean;
  sound: boolean;
  showTrees: boolean;
  settingsOpen: boolean;
  tourStep: number | null;
  showCars: boolean;
  /** Optional terrain heightmap (loaded if present) and its toggle; default OFF so the flat map is the locked look */
  terrain: Terrain | null;
  terrainOn: boolean;
  topoReport: TopoReport | null;
  /** Thin dim roads beyond the campus boundary (no buildings, no labels) */
  contextRoads: { k: string; pts: Vec2[] }[];
  screenshot: boolean;
  listOpen: boolean;
  aboutOpen: boolean;
  navOpen: boolean;
  from: Endpoint | null;
  to: Endpoint | null;
  route: RouteResult | null;
  routing: boolean;
  routeError: string | null;
  userPos: Vec2 | null;
  userAcc: number | null;
  userHeading: number | null;
  locate: 'off' | 'on' | 'follow';
  pickMode: 'from' | 'to' | null;
  floorsOpen: boolean;
  debug: boolean;
  showOffCampus: boolean;
  visited: Category[];
  found: string[];
  toast: string | null;
  focusTick: number;
  resetTick: number;
  set: (p: Partial<AppState>) => void;
  select: (id: string | null) => void;
  setToast: (t: string | null) => void;
}

const readAutoRecentre = () => {
  try {
    const raw = localStorage.getItem('nw-auto-recentre');
    const v = Number(raw);
    return raw != null && (AUTO_RECENTRE_CHOICES as readonly number[]).includes(v)
      ? v
      : AUTO_RECENTRE_DEFAULT;
  } catch {
    return AUTO_RECENTRE_DEFAULT;
  }
};

export const useApp = create<AppState>((set, get) => ({
  nav: 'IDLE',
  navPrevTopDown: null,
  navStep: 0,
  autoRecentreS: typeof window === 'undefined' ? AUTO_RECENTRE_DEFAULT : readAutoRecentre(),
  headingUp: false,
  startPickerOpen: false,
  chips: [],
  setChip: (c, kind) =>
    set((s) => {
      const k = c?.kind ?? kind;
      const rest = s.chips.filter((x) => x.kind !== k);
      return { chips: c ? [...rest, c] : rest };
    }),
  phase: 'loading',
  progress: 0,
  data: null,
  selectedId: null,
  category: null,
  night: false,
  topDown: false,
  quality: 'auto',
  effectiveLow: false,
  autoTier: 'high',
  interacting: false,
  showClouds: true,
  sheetPx: 0,
  perfOn: false,
  cardSnap: 'half',
  navSnap: 'peek',
  searchOpen: false,
  sound: false,
  showTrees: true,
  showCars: true,
  terrain: null,
  terrainOn: false,
  topoReport: null,
  contextRoads: [],
  settingsOpen: false,
  tourStep: null,
  screenshot: false,
  listOpen: false,
  aboutOpen: false,
  navOpen: false,
  from: null,
  to: null,
  route: null,
  routing: false,
  routeError: null,
  userPos: null,
  userAcc: null,
  userHeading: null,
  locate: 'off',
  pickMode: null,
  floorsOpen: false,
  debug: false,
  showOffCampus: false,
  visited: [],
  found: [],
  toast: null,
  focusTick: 0,
  resetTick: 0,
  set: (p) => set(p),
  select: (id) => {
    const s = get();
    const place = id ? s.data?.places.find((p) => p.id === id) : null;
    const visited =
      place && !s.visited.includes(place.category) && place.category !== 'other'
        ? [...s.visited, place.category]
        : s.visited;
    set({
      selectedId: id,
      cardSnap: 'peek',
      floorsOpen: false,
      focusTick: s.focusTick + 1,
      visited,
    });
    if (id) sfx.select();
    if (visited !== s.visited) {
      try {
        localStorage.setItem('nw-visited', JSON.stringify(visited));
      } catch {
        /* ignore */
      }
      get().setToast(`Explorer badge: ${place!.category}!`);
    }
  },
  setToast: (t) => {
    set({ toast: t });
    if (t) setTimeout(() => get().toast === t && set({ toast: null }), 2800);
  },
}));

/** Non-reactive accessors for the render loop. */
export const getApp = () => useApp.getState();

/** Switch the optional terrain on or off. The module state in lib/terrain.ts changes first so every groundY() call agrees. */
export function setTerrainOn(on: boolean) {
  const t = useApp.getState().terrain;
  setTerrain(t, on);
  useApp.setState({ terrainOn: on && !!t });
}
