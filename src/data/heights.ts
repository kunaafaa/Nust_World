/**
 * EDITABLE height + roof source. Highest priority in the height chain:
 *   heights.ts  >  landmarks.ts (heightM, levels)  >  OSM tags  >  category default.
 *
 * `source` says where the number came from. Entries whose source starts with "stylised" are artistic choices
 * (a dome where you described one), NOT surveyed measurements. Replace them as you verify on campus.
 * Leave `floors` out when you do not know it: the chain falls through to the next source.
 */
export type RoofType = 'flat' | 'dome' | 'dome-center' | 'barrel-vault' | 'gabled';

export interface HeightEntry {
  osmId: number;
  floors?: number;
  floorHeightM?: number;
  roofType?: RoofType;
  source: string;
}

export const DEFAULT_FLOOR_HEIGHT_M = 3.4;

export const HEIGHTS: HeightEntry[] = [
  {
    osmId: 209141896,
    roofType: 'dome-center',
    source:
      'stylised: drum + dome + portico from your description (floors/height from landmarks.ts)',
  },
  { osmId: 209836876, roofType: 'dome', source: 'stylised: auditorium dome (unverified)' },
  {
    osmId: 209668231,
    roofType: 'dome',
    source: 'stylised: RIMMS rectangular body with a dome, per your description',
  },
  {
    osmId: 208969441,
    roofType: 'dome',
    source: 'stylised: IAEC rectangular body with a dome, per your description',
  },
  { osmId: 1152605115, roofType: 'barrel-vault', source: 'stylised: sports hall barrel vault' },
  { osmId: 1152789399, roofType: 'barrel-vault', source: 'stylised: sports hall barrel vault' },
  { osmId: 209832837, roofType: 'barrel-vault', source: 'stylised: sports hall barrel vault' },
  { osmId: 1153465311, roofType: 'dome-center', source: 'stylised: mosque dome' },
  { osmId: 208960114, roofType: 'dome-center', source: 'stylised: mosque dome' },
];
