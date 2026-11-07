'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '@/store/useApp';
import { camState } from '@/scene/camState';
import { useEffect, useRef, useState } from 'react';
import { unproject } from '@/lib/geo';
import { perf } from '@/scene/perf';
import { LocateButton } from './Chrome';

function RoundBtn({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`chunky glass flex h-11 w-11 items-center justify-center text-sm font-black ${active ? '!bg-amber-300 !text-slate-900' : 'text-[var(--ink)]'}`}
    >
      {children}
    </button>
  );
}

const HOME_AZ = 0.35;
/** Hidden until the map has been rotated away from the default heading. */
function Compass() {
  const ref = useRef<HTMLSpanElement>(null);
  const [rotated, setRotated] = useState(false);
  useEffect(() => {
    let raf = 0,
      was = false;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const d = Math.atan2(
        Math.sin(camState.azimuth - HOME_AZ),
        Math.cos(camState.azimuth - HOME_AZ),
      );
      const r = Math.abs(d) > 0.08;
      if (r !== was) {
        was = r;
        setRotated(r);
      }
      if (ref.current) ref.current.style.transform = `rotate(${camState.azimuth}rad)`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!rotated) return null;
  return (
    <button
      aria-label="Reset view to north"
      onClick={() => useApp.setState((s) => ({ resetTick: s.resetTick + 1 }))}
      className="chunky glass flex h-11 w-11 items-center justify-center"
    >
      <span ref={ref} className="block text-xl leading-none" style={{ willChange: 'transform' }}>
        🧭
      </span>
    </button>
  );
}

/** One vertical stack of 44 px buttons, bottom-right, riding above the open bottom sheet. */
export function Controls() {
  const topDown = useApp((s) => s.topDown);
  const sheetPx = useApp((s) => s.sheetPx);
  const searching = useApp((s) => s.searchOpen);
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const r = () => setVh(window.innerHeight);
    r();
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  // hidden when a sheet is (nearly) full height; the CSS var follows the sheet while it is dragged
  if (searching || sheetPx > vh * 0.7) return null;
  return (
    <div
      className="absolute right-3 z-10 flex flex-col gap-2"
      style={{ bottom: `calc(var(--sheet-h, 0px) + var(--sab) + ${sheetPx > 0 ? 16 : 72}px)` }}
    >
      <Compass />
      <RoundBtn
        label={topDown ? 'Switch to 3D view' : 'Switch to 2D top-down view'}
        active={topDown}
        onClick={() => useApp.setState({ topDown: !topDown })}
      >
        {topDown ? '3D' : '2D'}
      </RoundBtn>
      <LocateButton />
    </div>
  );
}

const LEGEND: [string, string][] = [
  ['grass / park', '#24593a'],
  ['forest', '#1c4a33'],
  ['water', '#2379b3'],
  ['plaza', '#8b4d3e'],
  ['parking', '#454c5b'],
  ['pitch', '#17908a'],
  ['road', '#2d323b'],
  ['kerb', '#8c95a6'],
  ['footpath', '#7d5f52'],
  ['hostel area', '#2f2a24'],
];

export function DebugBar() {
  const debug = useApp((s) => s.debug);
  const showOff = useApp((s) => s.showOffCampus);
  const data = useApp((s) => s.data);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!debug) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [debug]);
  if (!debug || !data) return null;
  const r = data.report;
  const c = perf.cursor;
  const ll = c ? unproject(c[0], c[1]) : null;
  return (
    <div className="glass absolute bottom-16 right-3 z-10 hidden max-w-xs rounded-2xl p-3 text-[11px] leading-relaxed text-[var(--ink)] md:block">
      <b>DEBUG</b> · landmarks {r.landmarks} · matched {r.matched} · no footprint{' '}
      {r.noFootprint.length} · unlabelled footprints {r.footprintsWithoutLandmark.length}
      <div className="mt-1 font-mono">
        {perf.fps.toFixed(0)} fps · {perf.calls} draw calls · {(perf.triangles / 1000).toFixed(0)}k
        tris
        <br />
        instances {perf.instances}
        <br />
        {ll
          ? `lat ${ll[1].toFixed(6)} lng ${ll[0].toFixed(6)} · x ${c![0].toFixed(1)} z ${c![1].toFixed(1)}`
          : 'cursor: —'}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-2">
        {LEGEND.map(([n, col]) => (
          <span key={n} className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: col }} />
            {n}
          </span>
        ))}
      </div>
      <label className="mt-1 flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          checked={showOff}
          onChange={(e) => useApp.setState({ showOffCampus: e.target.checked })}
        />
        Show off-campus ({r.hiddenOffCampus})
      </label>
    </div>
  );
}

export function DebugToggleMobile() {
  const debug = useApp((s) => s.debug);
  const showOff = useApp((s) => s.showOffCampus);
  if (!debug) return null;
  return (
    <label className="glass absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold text-[var(--ink)] md:hidden">
      <input
        type="checkbox"
        checked={showOff}
        onChange={(e) => useApp.setState({ showOffCampus: e.target.checked })}
      />
      Off-campus
    </label>
  );
}

export function Toast() {
  const t = useApp((s) => s.toast);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(7rem+var(--sat))] z-40 flex justify-center px-4">
      <AnimatePresence>
        {t && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-full px-4 py-2 text-sm font-bold text-[var(--ink)]"
          >
            {t}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Loading() {
  const phase = useApp((s) => s.phase);
  const progress = useApp((s) => s.progress);
  return (
    <AnimatePresence>
      {phase === 'loading' && (
        <motion.div
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#0b1020] text-white"
        >
          <div className="text-3xl font-black tracking-tight">
            NUST <span className="text-amber-300">World</span>
          </div>
          <div
            className="h-2 w-56 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-full rounded-full bg-amber-300 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="text-sm text-white/60">Building the campus…</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
