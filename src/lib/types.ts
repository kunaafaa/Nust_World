import type { RoofType } from '@/data/heights';

export type Category =
  | 'academic'
  | 'hostel'
  | 'food'
  | 'sports'
  | 'admin'
  | 'gate'
  | 'prayer'
  | 'parking'
  | 'medical'
  | 'atm'
  | 'other';

export type Vec2 = [number, number]; // [x, z] in metres from campus origin (see lib/geo.ts)

/** Structural shape of an entry in data/landmarks.ts (the verified-source file). */
export interface LandmarkInput {
  id: string;
  osmId: number;
  name: string;
  shortName: string;
  officialName?: string;
  category: Category;
  lat: number;
  lng: number;
  levels?: number;
  heightM?: number;
  offCampus?: boolean;
  entrance?: { lat: number; lng: number } | null;
  aliases: string[];
  description: string;
  /** Key of data/menus/<menuId>.json (cafes only) */
  menuId?: string;
  verified: boolean;
}

export type PlaceSource = 'landmark' | 'osm' | 'extra' | 'provisional' | 'topo';

export interface Place {
  id: string;
  /**
   * landmark = landmarks.ts · osm = named OSM building missing from landmarks.ts · extra = flat feature
   * (gate, ground, parking, cafe point…) · provisional = block generated from a hostel area polygon
   */
  source: PlaceSource;
  osmId?: number;
  name: string;
  shortName: string;
  category: Category;
  aliases: string[];
  description: string;
  /** Key of data/menus/<menuId>.json (cafes only) */
  menuId?: string;
  verified: boolean;
  offCampus: boolean;
  levels?: number;
  heightM?: number;
  entrance?: Vec2 | null;
  /** Anchor position (metres) for labels, camera and routing */
  pos: Vec2;
  footprints: Vec2[][];
  resolvedHeight: number;
  /** Where the height came from: heights.ts | landmarks.ts | osm | category default */
  heightSource: string;
  heightEstimated: boolean;
  /** Pitches / parking / lake / pins: no 3D building */
  flat: boolean;
  /** Block generated from an area polygon because no building outline exists in OSM */
  provisional?: boolean;
  /** Known to exist (point in OSM) but has no outline at all */
  needsOutline?: boolean;
}

export interface BuildingShape {
  id: string;
  osmId: number;
  name?: string;
  footprint: Vec2[];
  holes: Vec2[][];
  height: number;
  heightSource: string;
  roofType: RoofType;
  placeId?: string;
  offCampus?: boolean;
  /** Where the outline comes from when it is not plain OSM (topo merge). Absent = OSM. */
  source?: string;
  /** Debug flags from the topo merge (e.g. OSM and Overture disagree by more than 3 m) */
  flags?: string[];
  /** Numeric room/unit label (e.g. "205"): drawn as a hostel-tinted block, never searchable */
  unit?: boolean;
  provisional?: boolean;
}

export interface Polyline {
  id: string;
  kind: string;
  points: Vec2[];
  name?: string;
  oneway?: boolean;
  roundabout?: boolean;
  surface?: string;
  tunnel?: boolean;
  bridge?: boolean;
  /** Added from Overture, not in OSM (topo merge) */
  provisional?: boolean;
  source?: string;
}
export interface Area {
  id: string;
  kind: string;
  points: Vec2[];
  holes: Vec2[][];
  name?: string;
  sport?: string;
  surface?: string;
  provisional?: boolean;
  source?: string;
}
export interface PointFeature {
  id: string;
  kind: string;
  pos: Vec2;
  name?: string;
  /** Canopy height and crown radius in metres (topo trees only) */
  h?: number;
  r?: number;
}

export interface DataReport {
  landmarks: number;
  matched: number;
  noFootprint: string[];
  footprintsWithoutLandmark: { id: string; name: string }[];
  hiddenOffCampus: number;
  extraPlaces: number;
  osmPlaces: number;
  provisional: { id: string; name: string; areaM2: number }[];
  needsOutline: string[];
  /** Landmarks whose lat/lng fell outside their own footprint and were moved to the polylabel centre */
  moved: { id: string; metres: number }[];
  heightSources: Record<string, number>;
  timestamp?: string;
}

export interface CampusData {
  buildings: BuildingShape[];
  roads: Polyline[];
  footways: Polyline[];
  parking: Area[];
  pitches: Area[];
  green: Area[];
  water: Area[];
  bare: Area[];
  plazas: Area[];
  points: PointFeature[];
  benches: PointFeature[];
  trees: PointFeature[];
  places: Place[];
  report: DataReport;
  /** Scene-space rings where individual (topo) trees replace the random scatter */
  treeRegion?: Vec2[][];
  /** Campus boundary ring (scene metres, CCW), when loaded */
  boundary?: Vec2[];
  /** natural=wetland polygons, drawn as dotted marsh instead of solid water (also still listed in `water`) */
  marsh?: Area[];
}
