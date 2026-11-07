import { cleanRing, orient } from './boundary';
import { project } from './geo';
import type { Vec2 } from './types';

export interface ContextFile {
  timestamp?: string;
  /** k = highway class, p = flat [lng, lat, lng, lat, ...] */
  ways: { k: string; p: number[] }[];
}

/** First polygon of the boundary GeoJSON -> open, CCW ring in scene metres. */
export function parseBoundary(gj: {
  features: { geometry: { coordinates: number[][][] } }[];
}): Vec2[] | null {
  const c = gj.features?.[0]?.geometry?.coordinates?.[0];
  if (!c || c.length < 4) return null;
  return orient(
    cleanRing(
      c.map(([lng, lat]) => project(lng, lat)),
      0.3,
    ),
  );
}

export function parseContext(f: ContextFile): { k: string; pts: Vec2[] }[] {
  return f.ways.map((w) => {
    const pts: Vec2[] = [];
    for (let i = 0; i < w.p.length; i += 2) pts.push(project(w.p[i], w.p[i + 1]));
    return { k: w.k, pts };
  });
}
