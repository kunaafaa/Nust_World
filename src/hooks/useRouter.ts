'use client';
import { useEffect } from 'react';
import { useApp } from '@/store/useApp';
import { track } from '@vercel/analytics';
import { sfx } from '@/lib/sfx';
import { WALK_SPEED } from '@/lib/routing';
import { pathLength3d, terrainActive } from '@/lib/terrain';

let worker: Worker | null = null;
let ready = false;
let reqId = 0;
let pending: (() => void) | null = null;

/** Spins up the routing worker once campus data is available and re-routes when endpoints change. */
export function useRouter() {
  const data = useApp((s) => s.data);
  const from = useApp((s) => s.from);
  const to = useApp((s) => s.to);
  const terrainOn = useApp((s) => s.terrainOn);

  useEffect(() => {
    if (!data || worker) return;
    worker = new Worker(new URL('../workers/route.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') {
        ready = true;
        pending?.();
        pending = null;
        return;
      }
      if (e.data.reqId !== reqId) return;
      const result = e.data.result;
      // The worker routes on the flat graph. With the optional terrain on, the reported distance and time include the
      // climb (the path itself is unchanged: slopes here are gentle, about 2 %).
      if (result && terrainActive()) {
        result.distance = pathLength3d(result.path);
        result.minutes = Math.max(1, Math.round(result.distance / WALK_SPEED / 60));
      }
      if (result) sfx.route();
      useApp.setState({
        route: result,
        routing: false,
        routeError: result ? null : 'No walkable path found between these points.',
      });
    };
    worker.postMessage({
      type: 'init',
      ways: [...data.footways, ...data.roads],
      landmarks: data.places
        .filter((p) => !p.id.startsWith('osm-') && p.category !== 'parking')
        .map((p) => ({ name: p.shortName, pos: p.pos })),
    });
  }, [data]);

  useEffect(() => {
    if (!from || !to) {
      useApp.setState({ route: null, routeError: null, routing: false });
      return;
    }
    const run = () => {
      reqId++;
      useApp.setState({ routing: true });
      worker!.postMessage({
        type: 'route',
        reqId,
        from: from.pos,
        to: to.pos,
        fromName: from.name,
        toName: to.approx ? `${to.name} (approximate entrance)` : to.name,
      });
      track('route_created');
    };
    if (ready) run();
    else pending = run;
    // terrainOn re-routes so the shown distance/time follow the toggle
  }, [from, to, terrainOn]);
}
