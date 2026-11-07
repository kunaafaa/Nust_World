/**
 * GLOBAL_OFFSET shifts every OSM-derived position by (east, north) metres. It is OFF on purpose:
 * only enable it if scripts/check-control-points.ts reports a systematic shift above 3 m (phone GPS error under
 * 5 m is noise, not a reason). It never applies to the GPS dot, which is projected independently.
 */
export const GLOBAL_OFFSET = { enabled: false, east: 0, north: 0 };
