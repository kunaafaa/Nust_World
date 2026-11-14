/**
 * Hostel placement: the single editable source for hostels drawn with another hostel's real footprint as a stand-in.
 *
 * Neither Rehmat Hostel nor Razi 1 has a building outline in OSM (only the "Razi Hostel Area" polygon), so each is
 * drawn with an exact copy of a Ghazali footprint from OSM (no scaling, no simplification, holes kept). They are
 * marked "template-based, approximate" everywhere (debug, card source, docs/needs-osm-outline.md) until someone traces
 * the real outlines in OSM. The Ghazali buildings themselves are never changed.
 *
 * How a copy is placed (applied in src/lib/hostelPlacement.ts, after the topo merge):
 *   1. take the template footprint and move its area centroid to the origin;
 *   2. `mirror: true` flips it left to right (east-west, in the template's own frame) first;
 *   3. rotate by `rotationDeg`, clockwise seen from above with north up (90 turns north-facing into east-facing);
 *   4. move it to `centre` ([lat, lng], WGS84) plus `offsetM` ([x, z] metres in scene axes: x = east, z = SOUTH).
 * The entrance is the template's own entrance side (the edge facing its access road at Ghazali), carried along with
 * the shape: rotating a copy by 180 turns its entrance round.
 *
 * Corrections: open the hostel with ?debug=1, check the arrow (entrance side), edit the values below, or press
 * "Copy placement JSON" on the card and paste back what you changed.
 */
export type HostelTemplate = 'ghazali-1' | 'ghazali-2';
export type PlacedHostel = 'rehmat' | 'razi-1';

export interface HostelPlacement {
  templateFrom: HostelTemplate;
  /** [lat, lng] where the template's area centroid lands (before offsetM) */
  centre: [number, number];
  /** clockwise from above, north up, degrees */
  rotationDeg: number;
  /** flip the template east-west (in its own frame) before rotating */
  mirror: boolean;
  /** extra shift in metres, scene axes: [x = east, z = south] */
  offsetM: [number, number];
}

/** Template footprints: OSM ways, read from the same data the map uses. */
export const HOSTEL_TEMPLATES: Record<HostelTemplate, { osmId: number; name: string }> = {
  'ghazali-1': { osmId: 209090803, name: 'Ghazali 1' },
  'ghazali-2': { osmId: 209091616, name: 'Ghazali 2' },
};

/** The OSM area polygon the copies sit in (Razi Hostel Area). */
export const PLACEMENT_AREA = { osmId: 209855481, id: 'way/209855481', name: 'Razi Hostel Area' };

/**
 * Starting values (2026-11-15). Rotations keep each template's box on the area's long axis (bearing 145 degrees)
 * and turn its entrance side toward the curved loop driveway (north-east side of the area): Ghazali 1's entrance
 * ends up facing about 70 degrees, Ghazali 2's about 85 degrees.
 *
 * Rehmat: `centre` is the centroid of the one Overture (Microsoft ML Buildings) outline in the area, next to Rehmat
 * Hostel Parking. Placed there unshifted, the copy comes too close to the parking strip, the loop and the footpaths
 * and leaves no room for Razi 1, so `offsetM` moves it 14.6 m (about 14 m south-east along the area, 4 m across).
 * Razi 1: no anchor in any data source; placed in the southern half with the largest clearances.
 */
export const HOSTEL_PLACEMENT: Record<PlacedHostel, HostelPlacement> = {
  rehmat: {
    templateFrom: 'ghazali-1',
    centre: [33.640112, 72.986528],
    rotationDeg: -94,
    mirror: false,
    offsetM: [4.7, 13.7],
  },
  'razi-1': {
    templateFrom: 'ghazali-2',
    centre: [33.639569, 72.986813],
    rotationDeg: 85,
    mirror: false,
    offsetM: [0, 0],
  },
};
