/// <reference lib="webworker" />
import {
  buildGraph,
  findRoute,
  largestComponent,
  type Graph,
  type NamedPoint,
} from '@/lib/routing';
import type { Polyline, Vec2 } from '@/lib/types';

type In =
  | { type: 'init'; ways: Polyline[]; landmarks: NamedPoint[] }
  | { type: 'route'; reqId: number; from: Vec2; to: Vec2; fromName: string; toName: string };

let graph: Graph | null = null;
let allowed = new Set<number>();
let landmarks: NamedPoint[] = [];

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'init') {
    graph = buildGraph(m.ways);
    allowed = largestComponent(graph);
    landmarks = m.landmarks;
    (self as unknown as Worker).postMessage({ type: 'ready' });
  } else if (graph) {
    const result = findRoute(graph, allowed, m.from, m.to, landmarks, m.fromName, m.toName);
    (self as unknown as Worker).postMessage({ type: 'route', reqId: m.reqId, result });
  }
};
