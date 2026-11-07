'use client';
import { useEffect, useState } from 'react';
import { useTier } from '@/lib/tier';
import { perf } from '@/scene/perf';
import { useApp } from '@/store/useApp';

/** ?perf=1: fps, draw calls, triangles, instance counts, JS heap and the active graphics tier. */
export function PerfOverlay() {
  const on = useApp((s) => s.perfOn);
  const tier = useTier();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return (
    <pre
      aria-hidden
      className="pointer-events-none absolute left-2 top-[calc(7.5rem+var(--sat))] z-50 rounded-lg bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300"
    >
      {`${perf.fps.toFixed(0)} fps · ${tier}\ncalls ${perf.calls} · tris ${(perf.triangles / 1000).toFixed(0)}k\ninstances ${perf.instances}\nheap ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/a'}`}
    </pre>
  );
}
