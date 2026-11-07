import { describe, expect, it } from 'vitest';
import { astar, buildGraph, findRoute, largestComponent, nearestNode } from '@/lib/routing';
import type { Polyline } from '@/lib/types';

// An L-shaped path A(0,0)→B(100,0)→C(100,100) and a disconnected island far away.
const ways: Polyline[] = [
  {
    id: 'w1',
    kind: 'footway',
    points: [
      [0, 0],
      [50, 0],
      [100, 0],
    ],
  },
  {
    id: 'w2',
    kind: 'footway',
    points: [
      [100, 0],
      [100, 50],
      [100, 100],
    ],
  },
  {
    id: 'w3',
    kind: 'service',
    points: [
      [500, 500],
      [510, 500],
    ],
  },
];
const g = buildGraph(ways);

describe('routing', () => {
  it('merges shared vertices', () => expect(g.nodes.length).toBe(7));
  it('finds shortest path along the L', () => {
    const a = nearestNode(g, [0, 0]),
      b = nearestNode(g, [100, 100]);
    const ids = astar(g, a, b)!;
    expect(ids).not.toBeNull();
    expect(g.nodes[ids[0]].pos).toEqual([0, 0]);
    expect(g.nodes[ids.at(-1)!].pos).toEqual([100, 100]);
  });
  it('returns null across disconnected components', () => {
    expect(astar(g, nearestNode(g, [0, 0]), nearestNode(g, [510, 500]))).toBeNull();
  });
  it('largestComponent excludes the island', () => {
    const keep = largestComponent(g);
    expect(keep.has(nearestNode(g, [510, 500]))).toBe(false);
  });
  it('findRoute yields distance, time and landmark-based directions', () => {
    const r = findRoute(
      g,
      largestComponent(g),
      [0, 0],
      [100, 100],
      [{ name: 'Library', pos: [105, 5] }],
      'Gate',
      'Hall',
    )!;
    expect(r.distance).toBeCloseTo(200, 0);
    expect(r.minutes).toBe(2);
    expect(r.steps.some((s) => s.text.includes('Library'))).toBe(true);
    expect(r.steps.at(-1)!.text).toBe('Arrive at Hall');
  });
});
