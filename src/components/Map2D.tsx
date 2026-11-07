'use client';
import { Component, useMemo, useRef, useState, type ReactNode } from 'react';
import { CAT_COLOR } from '@/lib/colors';
import type { CampusData, Vec2 } from '@/lib/types';
import { useApp } from '@/store/useApp';

/** True when this browser/device can create a WebGL context. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const path = (pts: Vec2[], close = false) =>
  'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L') + (close ? 'Z' : '');

/**
 * Flat SVG map used when WebGL is missing or the 3D scene crashes. Search, list view, navigation and the route
 * all still work because they live in the DOM and the router worker, not in the canvas.
 */
export function Map2D({ data }: { data: CampusData }) {
  const selectedId = useApp((s) => s.selectedId);
  const route = useApp((s) => s.route);
  const user = useApp((s) => s.userPos);
  const [view, setView] = useState({ cx: 0, cz: 0, w: 900 });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const layers = useMemo(
    () => ({
      green: data.green.map((g) => path(g.points, true)).join(''),
      water: data.water.map((g) => path(g.points, true)).join(''),
      roads: data.roads
        .filter((r) => r.kind !== 'busway')
        .map((r) => path(r.points))
        .join(''),
      foot: data.footways.map((r) => path(r.points)).join(''),
      parking: data.parking.map((g) => path(g.points, true)).join(''),
      pitch: data.pitches.map((g) => path(g.points, true)).join(''),
    }),
    [data],
  );
  const byPlace = useMemo(() => new Map(data.places.map((p) => [p.id, p])), [data]);

  const h = view.w * 0.7;
  const onWheel = (e: React.WheelEvent) =>
    setView((v) => ({ ...v, w: Math.min(3000, Math.max(80, v.w * (e.deltaY > 0 ? 1.15 : 0.87))) }));
  return (
    <svg
      ref={svg}
      role="img"
      aria-label="Flat map of the NUST campus (3D view unavailable)"
      className="absolute inset-0 h-full w-full touch-none bg-[#070d1c]"
      viewBox={`${view.cx - view.w / 2} ${view.cz - h / 2} ${view.w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      onWheel={onWheel}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const r = svg.current?.getBoundingClientRect();
        if (!d || !r) return;
        const k = view.w / r.width;
        setView((v) => ({
          ...v,
          cx: d.cx - (e.clientX - d.x) * k,
          cz: d.cz - (e.clientY - d.y) * k,
        }));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <path d={layers.green} fill="#24593a" />
      <path d={layers.water} fill="#2379b3" />
      <path d={layers.parking} fill="#454c5b" />
      <path d={layers.pitch} fill="#17908a" />
      <path
        d={layers.roads}
        fill="none"
        stroke="#3a414d"
        strokeWidth={view.w / 160}
        strokeLinejoin="round"
      />
      <path d={layers.foot} fill="none" stroke="#7d5f52" strokeWidth={view.w / 600} />
      {data.buildings
        .filter((b) => !b.offCampus)
        .map((b) => {
          const pl = b.placeId ? byPlace.get(b.placeId) : undefined;
          const col = pl ? CAT_COLOR[pl.category] : '#8fa3bf';
          const sel = !!pl && pl.id === selectedId;
          return (
            <path
              key={b.id}
              d={path(b.footprint, true)}
              fill={col}
              fillOpacity={sel ? 0.7 : 0.25}
              stroke={col}
              strokeWidth={sel ? view.w / 250 : view.w / 700}
              strokeDasharray={b.provisional ? `${view.w / 120} ${view.w / 200}` : undefined}
              onClick={() => pl && useApp.getState().select(pl.id)}
              style={{ cursor: pl ? 'pointer' : 'default' }}
            />
          );
        })}
      {route && (
        <path
          d={path(route.path)}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={view.w / 140}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {user && (
        <circle
          cx={user[0]}
          cy={user[1]}
          r={view.w / 90}
          fill="#3b82f6"
          stroke="#fff"
          strokeWidth={view.w / 400}
        />
      )}
    </svg>
  );
}

/** Catches render crashes in the 3D scene and shows the flat map instead of a blank screen. */
export class SceneBoundary extends Component<
  { data: CampusData; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[NUST World] 3D scene crashed, using 2D map', err);
  }
  render() {
    return this.state.failed ? <Map2D data={this.props.data} /> : this.props.children;
  }
}
