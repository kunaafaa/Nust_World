import { create } from 'zustand';
import type { CampusData, Category, Vec2 } from '@/lib/types';
import type { RouteResult } from '@/lib/routing';
import { sfx } from '@/lib/sfx';
import { setTerrain, type Terrain } from '@/lib/terrain';
import type { TopoReport } from '@/lib/topoMerge';

export type Phase = 'loading' | 'title' | 'explore';
export type Quality = 'auto' | 'low' | 'medium' | 'high';

/** approx: no verified entrance, so the route ends at the nearest footpath point */
export interface Endpoint {
  id?: string;
  name: string;
  pos: Vec2;
  approx?: boolean;
}

interface AppState {
  phase: Phase;
  progress: number;
  data: CampusData | null;
  selectedId: string | null;
  category: Category | null;
  night: boolean;
  topDown: boolean;
  quality: Quality;
  effectiveLow: boolean; // result of auto-scaling or manual low
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

export const useApp = create<AppState>((set, get) => ({
  phase: 'loading',
  progress: 0,
  data: null,
  selectedId: null,
  category: null,
  night: false,
  topDown: false,
  quality: 'auto',
  effectiveLow: false,
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
    set({ selectedId: id, floorsOpen: false, focusTick: s.focusTick + 1, visited });
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
