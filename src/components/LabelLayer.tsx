'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAT_COLOR, CAT_PRIORITY } from '@/lib/colors';
import { groundY } from '@/lib/terrain';
import type { Place } from '@/lib/types';
import { camState } from '@/scene/camState';
import { viewApi } from '@/scene/viewApi';
import { useApp } from '@/store/useApp';

const POOL = 90;
const H = 24;
const v = new THREE.Vector3();

/** Max labels allowed for a camera distance: fewer when zoomed out so the map stays readable. */
function budget(dist: number) {
  if (dist > 1100) return 8;
  if (dist > 750) return 18;
  if (dist > 450) return 34;
  if (dist > 250) return 55;
  return POOL;
}

/**
 * Floating labels. Fixed pool of DOM nodes updated imperatively (~20 Hz) so React never re-renders on camera
 * movement. Greedy priority placement hides colliding labels; low-priority categories need zoom.
 */
export function LabelLayer() {
  const data = useApp((s) => s.data);
  const showOff = useApp((s) => s.showOffCampus);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const places = useMemo(
    () => (data?.places ?? []).filter((p) => showOff || !p.offCampus),
    [data, showOff],
  );
  const placesRef = useRef<Place[]>(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    let raf = 0,
      last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 50) return;
      last = t;
      const cam = viewApi.camera;
      const st = useApp.getState();
      const hide = () => nodes.current.forEach((n) => n && (n.style.display = 'none'));
      if (!cam || st.phase !== 'explore' || st.screenshot) return hide();
      const W = viewApi.width,
        Hh = viewApi.height;
      const dist = camState.distance;
      const cands: { p: Place; x: number; y: number; w: number; score: number }[] = [];
      for (const p of placesRef.current) {
        const closeOnly =
          p.category === 'parking' || p.category === 'atm' || (p.flat && p.category === 'other');
        const isSel = p.id === st.selectedId;
        const catMatch = st.category ? p.category === st.category : false;
        if (st.category && !catMatch && !isSel) continue;
        if (closeOnly && dist > 380 && !isSel && !catMatch) continue;
        v.set(
          p.pos[0],
          (p.flat ? 6 : p.resolvedHeight + 5) + groundY(p.pos[0], p.pos[1]),
          p.pos[1],
        ).project(cam);
        if (v.z > 1) continue;
        const x = (v.x * 0.5 + 0.5) * W,
          y = (-v.y * 0.5 + 0.5) * Hh;
        if (x < -40 || x > W + 40 || y < 40 || y > Hh - 40) continue;
        const label = st.debug ? `${p.shortName} · ${p.osmId ?? ''}` : p.shortName;
        const score =
          (isSel ? 10000 : 0) +
          (catMatch ? 2000 : 0) +
          CAT_PRIORITY[p.category] * 10 +
          Math.min(p.resolvedHeight, 30) -
          dist * 0;
        cands.push({ p, x, y, w: 26 + label.length * 6.6, score });
      }
      cands.sort((a, b) => b.score - a.score);
      const placed: { x: number; y: number; w: number }[] = [];
      let used = 0;
      const max = st.category ? POOL : budget(dist);
      for (const c of cands) {
        if (used >= max) break;
        const forced = c.p.id === st.selectedId;
        const x0 = c.x - c.w / 2;
        if (
          !forced &&
          placed.some(
            (o) => Math.abs(o.x - c.x) < (o.w + c.w) / 2 + 3 && Math.abs(o.y - c.y) < H + 2,
          )
        )
          continue;
        placed.push({ x: c.x, y: c.y, w: c.w });
        const n = nodes.current[used++];
        if (!n) break;
        const label = st.debug
          ? `${c.p.shortName} · ${c.p.osmId ?? ''}${c.p.heightEstimated ? ' · est.h' : ''}`
          : c.p.shortName;
        n.style.display = 'flex';
        n.style.transform = `translate(${Math.round(x0)}px, ${Math.round(c.y - H)}px)`;
        n.style.borderColor = CAT_COLOR[c.p.category];
        n.style.zIndex = forced ? '5' : '1';
        n.style.opacity = c.p.verified || !st.debug ? '1' : '0.92';
        n.dataset.sel = forced ? '1' : '0';
        (n.firstChild as HTMLElement).style.background = CAT_COLOR[c.p.category];
        (n.lastChild as HTMLElement).textContent = label;
      }
      for (let i = used; i < POOL; i++) {
        const n = nodes.current[i];
        if (n) n.style.display = 'none';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: POOL }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            nodes.current[i] = el;
          }}
          className="absolute left-0 top-0 hidden items-center gap-1.5 whitespace-nowrap rounded-full border-2 bg-white/92 px-2 text-[11px] font-bold leading-[20px] text-slate-800 shadow-md data-[sel='1']:scale-110 data-[sel='1']:bg-amber-200"
          style={{ height: 24, willChange: 'transform' }}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" />
          <span />
        </div>
      ))}
    </div>
  );
}
