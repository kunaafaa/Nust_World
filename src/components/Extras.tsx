'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { track } from '@vercel/analytics';
import { usePlaces } from '@/hooks/usePlaces';
import { CAT_COLOR, CAT_LABEL } from '@/lib/colors';
import { setSoundEnabled, sfx, soundEnabled } from '@/lib/sfx';
import type { Category, Place } from '@/lib/types';
import { captureApi } from '@/scene/CampusScene';
import { setTerrainOn, useApp, type Quality } from '@/store/useApp';
import { BottomSheet, type Snap } from './BottomSheet';

// ───────── Settings ─────────
function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-bold text-[var(--ink)]">
      {label}
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-amber-400"
      />
    </label>
  );
}

export function SettingsButton() {
  const open = useApp((s) => s.settingsOpen);
  return (
    <button
      aria-label="Settings"
      aria-expanded={open}
      title="Settings"
      onClick={() => useApp.setState((s) => ({ settingsOpen: !s.settingsOpen }))}
      className="glass absolute right-4 top-[calc(0.75rem+var(--sat))] z-20  flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] md:right-4"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </button>
  );
}

export function SettingsPanel() {
  const open = useApp((s) => s.settingsOpen);
  const quality = useApp((s) => s.quality);
  const effLow = useApp((s) => s.effectiveLow);
  const autoTier = useApp((s) => s.autoTier);
  const trees = useApp((s) => s.showTrees);
  const cars = useApp((s) => s.showCars);
  const clouds = useApp((s) => s.showClouds);
  const night = useApp((s) => s.night);
  const hasTerrain = useApp((s) => !!s.terrain);
  const terrainOn = useApp((s) => s.terrainOn);
  const [sound, setSound] = useState(true);
  const [snap, setSnap] = useState<Snap>('half');
  // localStorage is only readable after mount (hydration-safe).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSound(soundEnabled()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setSnap('half');
  }, [open]);
  // Tapping the map (not dragging it) closes the sheet.
  useEffect(() => {
    if (!open) return;
    let d: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      d = (e.target as HTMLElement).tagName === 'CANVAS' ? { x: e.clientX, y: e.clientY } : null;
    };
    const up = (e: PointerEvent) => {
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8)
        useApp.setState({ settingsOpen: false });
      d = null;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
    };
  }, [open]);
  const q = (v: Quality) => useApp.setState({ quality: v, effectiveLow: v === 'low' });
  const close = () => useApp.setState({ settingsOpen: false });
  return (
    <BottomSheet
      open={open}
      snap={snap}
      onSnap={setSnap}
      onClose={close}
      peek={56}
      label="Settings"
      header={
        <div className="flex h-11 items-center justify-between">
          <h2 className="text-lg font-extrabold text-[var(--ink)]">Settings</h2>
          <button
            aria-label="Close settings"
            onClick={close}
            className="flex h-11 w-11 items-center justify-center text-[var(--ink-soft)]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      }
    >
      <div className="text-xs font-black uppercase tracking-wide text-[var(--ink-soft)]">
        Graphics quality
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1.5" role="group" aria-label="Graphics quality">
        {(['auto', 'low', 'medium', 'high'] as Quality[]).map((v) => (
          <button
            key={v}
            aria-pressed={quality === v}
            onClick={() => q(v)}
            className={`chunky min-h-11 rounded-xl px-1 text-[12px] font-black capitalize ${quality === v ? 'bg-amber-300 text-slate-900' : 'bg-black/10 text-[var(--ink)]'}`}
          >
            {v}
          </button>
        ))}
      </div>
      {quality === 'auto' && (
        <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
          Auto chose {effLow ? 'low' : autoTier} for this device from a quick speed test, and drops
          a tier if the frame rate stays low.
        </p>
      )}
      <div className="mt-2 border-t border-black/10 pt-1">
        <Switch
          label="Day / night"
          on={night}
          onChange={(v) => {
            useApp.setState({ night: v });
            document.documentElement.dataset.night = String(v);
          }}
        />
        <Switch label="Trees" on={trees} onChange={(v) => useApp.setState({ showTrees: v })} />
        <Switch label="Cars" on={cars} onChange={(v) => useApp.setState({ showCars: v })} />
        <Switch label="Clouds" on={clouds} onChange={(v) => useApp.setState({ showClouds: v })} />
        {hasTerrain && (
          <>
            <Switch label="Terrain (approximate)" on={terrainOn} onChange={setTerrainOn} />
            {terrainOn && (
              <p className="px-1 text-[11px] text-[var(--ink-soft)]">
                Built from a 30 m global model, so it shows the broad slope only. Off keeps the
                exact flat map.
              </p>
            )}
          </>
        )}
        <Switch
          label="Sound"
          on={sound}
          onChange={(v) => {
            setSound(v);
            setSoundEnabled(v);
            if (v) sfx.tap();
          }}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-black/10 pt-2">
        <button
          className="chunky glass min-h-11 py-2 text-xs font-black text-[var(--ink)]"
          onClick={() => useApp.setState({ listOpen: true, settingsOpen: false })}
        >
          List view
        </button>
        <button
          className="chunky glass min-h-11 py-2 text-xs font-black text-[var(--ink)]"
          onClick={() => useApp.setState({ tourStep: 0, settingsOpen: false })}
        >
          First day tour
        </button>
        <button
          className="chunky glass min-h-11 py-2 text-xs font-black text-[var(--ink)]"
          onClick={() =>
            useApp.setState({ screenshot: true, settingsOpen: false, selectedId: null })
          }
        >
          Screenshot
        </button>
        <button
          className="chunky glass min-h-11 py-2 text-xs font-black text-[var(--ink)]"
          onClick={() => useApp.setState({ aboutOpen: true, settingsOpen: false })}
        >
          About and attribution
        </button>
      </div>
    </BottomSheet>
  );
}

// ───────── Nearest quick actions (needs live location) ─────────
const QUICK: { cat: Category; label: string }[] = [
  { cat: 'food', label: 'Food' },
  { cat: 'prayer', label: 'Masjid' },
  { cat: 'gate', label: 'Gate' },
  { cat: 'atm', label: 'ATM' },
];

export function NearestBar() {
  const pos = useApp((s) => s.userPos);
  const nav = useApp((s) => s.navOpen);
  const sheet = useApp((s) => !!s.selectedId);
  const { places } = usePlaces();
  if (!pos || nav || sheet) return null;
  const go = (cat: Category) => {
    const near = places
      .filter((p) => p.category === cat && !p.offCampus && !p.provisional)
      .map((p) => ({ p, d: Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!near) return useApp.getState().setToast(`No ${cat} found nearby`);
    track('nearest', { cat });
    useApp.getState().set({
      from: { name: 'My location', pos },
      to: {
        id: near.p.id,
        name: near.p.shortName,
        pos: near.p.entrance ?? near.p.pos,
        approx: !near.p.entrance,
      },
      navOpen: true,
    });
  };
  return (
    <div className="scroll-hide absolute bottom-[calc(0.75rem+var(--sab))] left-[68px] right-3 z-20 flex gap-2 overflow-x-auto md:left-[68px] md:right-auto">
      <span className="glass hidden items-center rounded-full px-3 text-xs font-black text-[var(--ink)] md:flex">
        Nearest
      </span>
      {QUICK.map((q) => (
        <button
          key={q.cat}
          onClick={() => go(q.cat)}
          className="chunky glass flex h-11 shrink-0 items-center gap-1.5 px-3 text-xs font-black text-[var(--ink)]"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR[q.cat] }} />
          {q.label}
        </button>
      ))}
    </div>
  );
}

// ───────── Onboarding (3 tooltips, once) ─────────
const TIPS = [
  {
    t: 'Move around',
    b: 'Drag to pan, pinch to zoom, two fingers to rotate. Double-tap zooms in.',
  },
  {
    t: 'Tap any building',
    b: 'Tap a building or a label to see what it is, what is nearby, and share it.',
  },
  {
    t: 'Never get lost',
    b: 'Hit Navigate on any place for walking directions, or tap the blue target to see where you are.',
  },
];

export function Onboarding() {
  const phase = useApp((s) => s.phase);
  const hidden = useApp((s) => s.sheetPx > 0 || s.searchOpen);
  const [i, setI] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== 'explore') return;
    try {
      if (localStorage.getItem('nw-onboarded') === '1') return;
    } catch {
      /* show anyway */
    }
    const t = setTimeout(() => setI(0), 2500);
    return () => clearTimeout(t);
  }, [phase]);
  const done = () => {
    setI(null);
    try {
      localStorage.setItem('nw-onboarded', '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <AnimatePresence>
      {i !== null && !hidden && (
        <motion.div
          key={i}
          role="dialog"
          aria-label="Tip"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="glass absolute bottom-[calc(4.25rem+var(--sab))] left-3 right-[68px] z-30 max-w-sm rounded-2xl p-3.5 md:bottom-16"
        >
          <div className="text-[11px] font-black uppercase tracking-wide text-amber-500">
            Tip {i + 1} of {TIPS.length}
          </div>
          <div className="text-base font-black text-[var(--ink)]">{TIPS[i].t}</div>
          <p className="mt-0.5 text-sm text-[var(--ink)]">{TIPS[i].b}</p>
          <div className="mt-3 flex justify-between">
            <button onClick={done} className="text-sm font-bold text-[var(--ink-soft)] underline">
              Skip
            </button>
            <button className="chunky rounded-xl bg-amber-300 px-4 py-1.5 text-sm font-black text-slate-900">
              {i + 1 < TIPS.length ? 'Next' : 'Got it'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────── "First day at NUST" tour ─────────
const TOUR: { match: RegExp; blurb: string }[] = [
  {
    match: /^gate no\. ?1\b|^gate 1\b/i,
    blurb: 'Start at the gate. Everything you need is a short walk from here.',
  },
  {
    match: /main office/i,
    blurb: 'The Main Office, with the dome you will see on every NUST photo.',
  },
  {
    match: /central library/i,
    blurb: 'The Central Library: quiet floors, group rooms and a lot of 2 a.m. memories.',
  },
  {
    match: /^seecs|seecs ug/i,
    blurb: 'SEECS, home of CS, EE and friends who never leave the lab.',
  },
  {
    match: /cafe|café|cafeteria|mess|concordia/i,
    blurb: 'Fuel up. Every hostel has a mess, and the cafes keep you alive between classes.',
  },
  { match: /masjid/i, blurb: 'The campus mosque, a calm spot between lectures.' },
];

export function Tour() {
  const step = useApp((s) => s.tourStep);
  const { places } = usePlaces();
  const stops = useMemo(
    () =>
      TOUR.map((t) => ({
        ...t,
        place: places.find(
          (p) => !p.provisional && (t.match.test(p.shortName) || t.match.test(p.name)),
        ),
      })).filter((s) => s.place),
    [places],
  );
  useEffect(() => {
    if (step == null) return;
    const s = stops[step];
    if (s?.place) useApp.getState().select(s.place.id);
  }, [step, stops]);
  if (step == null || !stops.length) return null;
  const s = stops[Math.min(step, stops.length - 1)];
  const exit = () => useApp.setState({ tourStep: null, selectedId: null });
  return (
    <div
      role="dialog"
      aria-label="First day at NUST tour"
      className="glass absolute left-3 right-3 top-[calc(7rem+var(--sat))] z-30 mx-auto max-w-md rounded-2xl p-3 md:left-4 md:right-auto md:top-auto md:bottom-16"
    >
      <div className="text-[11px] font-black uppercase tracking-wide text-amber-500">
        First day at NUST · {step + 1}/{stops.length}
      </div>
      <div className="text-base font-black text-[var(--ink)]">{s.place!.shortName}</div>
      <p className="text-sm text-[var(--ink)]">{s.blurb}</p>
      <div className="mt-2 flex justify-between gap-2">
        <button onClick={exit} className="text-sm font-bold text-[var(--ink-soft)] underline">
          Exit tour
        </button>
        <div className="flex gap-2">
          <button
            disabled={step === 0}
            onClick={() => useApp.setState({ tourStep: step - 1 })}
            className="chunky glass px-3 py-1 text-sm font-black text-[var(--ink)] disabled:opacity-40"
          >
            Back
          </button>
          <button
            onClick={() =>
              step + 1 < stops.length ? useApp.setState({ tourStep: step + 1 }) : exit()
            }
            className="chunky rounded-xl bg-amber-300 px-4 py-1 text-sm font-black text-slate-900"
          >
            {step + 1 < stops.length ? 'Next' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────── Screenshot mode ─────────
export function ScreenshotBar() {
  const on = useApp((s) => s.screenshot);
  if (!on) return null;
  const snap = async () => {
    const blob = await captureApi.capture(2);
    if (!blob) return useApp.getState().setToast('Could not capture the map');
    const file = new File([blob], 'nust-world.png', { type: 'image/png' });
    track('screenshot');
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'NUST World',
          text: 'Never get lost at NUST again. nust-world.vercel.app',
        });
        return;
      }
    } catch {
      return; /* cancelled */
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nust-world.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  return (
    <div className="absolute inset-x-0 bottom-[calc(1rem+var(--sab))] z-30 flex justify-center gap-3">
      <button
        onClick={snap}
        className="chunky rounded-2xl bg-amber-300 px-6 py-3 font-black text-slate-900"
      >
        Capture
      </button>
      <button
        onClick={() => useApp.setState({ screenshot: false })}
        className="chunky glass px-5 py-3 font-black text-[var(--ink)]"
      >
        Exit
      </button>
    </div>
  );
}

// ───────── List view (accessible alternative to the 3D map) ─────────
export function ListView() {
  const open = useApp((s) => s.listOpen);
  const { places } = usePlaces();
  const groups = useMemo(() => {
    const m = new Map<Category, Place[]>();
    for (const p of places) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()].sort((a, b) => CAT_LABEL[a[0]].localeCompare(CAT_LABEL[b[0]]));
  }, [places]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && useApp.setState({ listOpen: false });
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All places"
      className="absolute inset-0 z-50 overflow-y-auto bg-[#070d1c]/95 px-4 pb-[calc(2rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white"
    >
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black">All places</h2>
          <button
            autoFocus
            onClick={() => useApp.setState({ listOpen: false })}
            className="chunky rounded-xl bg-white/15 px-4 py-2 font-black"
          >
            Close
          </button>
        </div>
        {groups.map(([cat, ps]) => (
          <section key={cat} className="mt-5">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-white/70">
              <span className="h-3 w-3 rounded-full" style={{ background: CAT_COLOR[cat] }} />
              {CAT_LABEL[cat]} ({ps.length})
            </h3>
            <ul className="mt-1 divide-y divide-white/10">
              {ps
                .sort((a, b) => a.shortName.localeCompare(b.shortName))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      className="w-full py-2.5 text-left text-base font-semibold"
                      onClick={() => {
                        useApp.setState({ listOpen: false, tourStep: null });
                        useApp.getState().select(p.id);
                      }}
                    >
                      {p.shortName}
                      {p.provisional ? ' (provisional)' : ''}
                      {!p.verified ? ' · unverified' : ''}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
