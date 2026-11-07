import { describe, expect, it } from 'vitest';
import {
  buildSnapIndex,
  distToPath,
  maybeSnap,
  nearCampus,
  plausible,
  smooth,
  type Fix,
} from '@/lib/location';
import type { Vec2 } from '@/lib/types';

const fix = (x: number, z: number, t: number, accuracy = 8): Fix => ({ pos: [x, z], accuracy, t });

describe('location filters', () => {
  it('rejects jumps above 30 m/s and accepts walking', () => {
    expect(plausible(fix(0, 0, 0), fix(1.4, 0, 1000))).toBe(true);
    expect(plausible(fix(0, 0, 0), fix(200, 0, 2000))).toBe(false); // 100 m/s
    expect(plausible(null, fix(5000, 0, 0))).toBe(true);
  });
  it('smoothing moves toward the new fix without overshooting', () => {
    const p = smooth([0, 0], fix(10, 0, 1000, 10), 10);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[0]).toBeLessThan(10);
  });
  it('recognises campus vicinity', () => {
    expect(nearCampus(72.9915, 33.643)).toBe(true);
    expect(nearCampus(74.3, 31.5)).toBe(false); // Lahore
  });
});

describe('snapping to footpaths', () => {
  const path: Vec2[][] = [
    [
      [0, 0],
      [100, 0],
    ],
  ];
  const idx = buildSnapIndex(path);
  it('snaps when accurate and close', () => {
    const p = maybeSnap(idx, [40, 6], 10);
    expect(p[0]).toBeCloseTo(40);
    expect(p[1]).toBeCloseTo(0);
  });
  it('does not snap when the path is more than 15 m away', () => {
    expect(maybeSnap(idx, [40, 20], 10)).toEqual([40, 20]);
  });
  it('does not snap when accuracy is poor (>= 25 m)', () => {
    expect(maybeSnap(idx, [40, 6], 30)).toEqual([40, 6]);
  });
  it('distToPath measures the nearest segment', () => {
    expect(distToPath([50, 7], path[0])).toBeCloseTo(7);
  });
});
