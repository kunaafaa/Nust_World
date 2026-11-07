/** Palette + layer stack for the ground. One place so day/night, outline buildings and ground stay coherent. */
export const COL = {
  bg: '#070d1c',
  base: '#12233a',
  bare: '#2f2a24',
  grass: '#24593a',
  forest: '#1c4a33',
  water: '#2379b3',
  plaza: '#8b4d3e',
  parking: '#454c5b',
  parkingLine: '#c9cfda',
  pitch: '#17908a',
  pitchLine: '#f2f6f4',
  cricketStrip: '#c9b27d',
  asphalt: '#2d323b',
  busway: '#3a2f3f',
  curb: '#8c95a6',
  foot: '#7d5f52',
  lane: '#e8dfa8',
} as const;

/** Heights (m) of each ground layer, bottom → top. Tiny steps + polygonOffset + renderOrder stop z-fighting. */
export const LAYER = {
  base: 0,
  bare: 0.03,
  grass: 0.06,
  forest: 0.09,
  water: 0.12,
  plaza: 0.15,
  parking: 0.18,
  pitch: 0.21,
  curb: 0.24,
  road: 0.27,
  foot: 0.31,
  mark: 0.35,
} as const;

export type LayerName = keyof typeof LAYER;
export const LAYER_ORDER = Object.keys(LAYER) as LayerName[];

/** Road widths (m) by highway tag. */
export const ROAD_WIDTH: Record<string, number> = {
  trunk: 13,
  trunk_link: 7,
  primary: 12,
  secondary: 8,
  secondary_link: 6,
  tertiary: 7,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  busway: 7,
};
export const FOOT_WIDTH: Record<string, number> = {
  footway: 1.8,
  path: 1.5,
  steps: 1.8,
  pedestrian: 3,
  track: 2.5,
  cycleway: 1.6,
};

export const CAT_LINE: Record<string, string> = {
  academic: '#5aa2ff',
  hostel: '#ff9a6c',
  food: '#ffd04d',
  sports: '#37d69a',
  admin: '#b79dff',
  gate: '#ff5d5d',
  prayer: '#3fe0cf',
  parking: '#9fb0c8',
  medical: '#ff7f95',
  atm: '#4ade80',
  other: '#8fa3bf',
};

/** Production edge: marsh style, campus border glow, context-ring roads. All colours live here (locked Night Outline look). */
export const EDGE = {
  marsh: '#1e4a52',
  marshDot: '#66aaa6',
  border: '#8fd6ff',
  contextRoad: '#3a4559',
  /** metres: ground layers extend past the boundary and feather out over this distance */
  groundBuffer: 30,
  /** metres: roads fade to zero over the last stretch before the buffer edge */
  roadFade: 60,
  /** metres: context-ring roads fade out over this range beyond the boundary */
  contextRange: 400,
} as const;
