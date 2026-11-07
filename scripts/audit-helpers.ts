// Thin re-exports so audit scripts import geometry from the one projection module.
export { centroid, dist, pointInPolygon, polygonArea, project, unproject } from '../src/lib/geo';
export { GAP_SNAP as GAP_SNAP_NOTE } from '../src/lib/routing';
