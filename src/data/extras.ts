/** Non-factual game content. Hidden collectibles: [lon, lat]. Safe to edit or delete. */
export const EASTER_EGGS: { id: string; lonLat: [number, number]; label: string }[] = [
  { id: 'golden-duck', lonLat: [72.9948, 33.6452], label: 'You found the Golden Duck!' },
  { id: 'golden-book', lonLat: [72.9928, 33.6418], label: 'You found the Golden Book!' },
];

/**
 * Search-only shorthand keyed by OSM id. These never appear as facts in the UI;
 * add real aliases to landmarks.ts to make them official.
 */
export const SEARCH_HINTS: Record<number, string[]> = {};

/** Landmarks removed from the rendered map entirely (footprint, label and search). */
export const HIDDEN_LANDMARK_IDS = ['sada-walon-ki-jhoprian-7994'];

/** Named OSM extras that are map clutter rather than places (benches, a roundabout, a water tap). */
export const EXTRA_NAME_DENYLIST =
  /bench|canopy|water point|round ?about|trail|greenery|^grass$|backyard|small_lawn|plantation|^parking( area)?$|iqra|apartment/i;
