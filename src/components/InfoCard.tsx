'use client';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { track } from '@vercel/analytics';
import { landmarks } from '@/data/landmarks';
import { CAT_COLOR, CAT_LABEL } from '@/lib/colors';
import { unproject } from '@/lib/geo';
import type { Place } from '@/lib/types';
import { useApp } from '@/store/useApp';

const COMING = 'Info coming soon';
const REPORT_EMAIL = process.env.NEXT_PUBLIC_REPORT_EMAIL ?? '';

/** The landmarks.ts entry for a place, ready to paste back after editing. */
export function landmarkJson(p: Place): string {
  const orig = landmarks.find((l) => l.id === p.id);
  if (orig) return JSON.stringify(orig, null, 2);
  const [lng, lat] = unproject(p.pos[0], p.pos[1]);
  return JSON.stringify(
    {
      id: p.id,
      osmId: p.osmId,
      name: p.name,
      shortName: p.shortName,
      category: p.category,
      lat: +lat.toFixed(6),
      lng: +lng.toFixed(6),
      entrance: null,
      aliases: p.aliases,
      description: p.description,
      verified: false,
    },
    null,
    2,
  );
}

/** A heights.ts entry for a place, ready to paste back after editing. */
export function heightJson(p: Place): string {
  return JSON.stringify(
    {
      osmId: p.osmId ?? null,
      floors: p.levels ?? null,
      floorHeightM: 3.4,
      roofType: 'flat',
      source: 'TODO: where did you get the floor count? (photo, site visit, official document)',
    },
    null,
    2,
  );
}

/** Closest other places (by straight line), for the "Nearby" list. */
export function nearbyPlaces(p: Place, all: Place[], n = 4, maxM = 220) {
  return all
    .filter((o) => o.id !== p.id && !o.offCampus && !o.provisional && o.category !== 'parking')
    .map((o) => ({ o, d: Math.hypot(o.pos[0] - p.pos[0], o.pos[1] - p.pos[1]) }))
    .filter((x) => x.d <= maxM)
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

function report(p: Place) {
  const text = `NUST World correction\nPlace: ${p.name} (id: ${p.id}, osm: ${p.osmId ?? 'n/a'})\nWhat is wrong / correct info:\n`;
  track('report_mistake', { id: p.id });
  if (REPORT_EMAIL) {
    window.location.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent('NUST World: ' + p.shortName)}&body=${encodeURIComponent(text)}`;
  } else {
    navigator.clipboard?.writeText(text).catch(() => {});
    useApp.getState().setToast('Report text copied — paste it into a message to the maintainer');
  }
}

function Row({ label, value }: { label: string; value?: string | number }) {
  const missing = value === undefined || value === '';
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-black/5 py-2 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-[var(--ink-soft)]">{label}</dt>
      <dd
        className={`text-right text-sm font-semibold ${missing ? 'italic text-[var(--ink-soft)]' : 'text-[var(--ink)]'}`}
      >
        {missing ? COMING : value}
      </dd>
    </div>
  );
}

export function InfoCard() {
  const id = useApp((s) => s.selectedId);
  const data = useApp((s) => s.data);
  const debug = useApp((s) => s.debug);
  const navOpen = useApp((s) => s.navOpen);
  const p = id ? data?.places.find((x) => x.id === id) : null;
  const near = p && data ? nearbyPlaces(p, data.places) : [];

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 500) useApp.getState().select(null);
  };
  const share = async () => {
    if (!p) return;
    const url = `${location.origin}${location.pathname}?place=${p.id}`;
    track('share', { id: p.id });
    try {
      if (navigator.share)
        await navigator.share({
          title: `${p.shortName} — NUST World`,
          text: `Find ${p.shortName} on NUST World`,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        useApp.getState().setToast('Link copied');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <AnimatePresence>
      {p && !navOpen && (
        <motion.section
          key={p.id}
          role="dialog"
          aria-label={`${p.name} details`}
          initial={{ y: '100%', opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={onDragEnd}
          className="glass fixed inset-x-0 bottom-0 z-20 max-h-[62vh] overflow-y-auto rounded-t-3xl p-4 pb-[calc(1rem+var(--sab))] md:inset-x-auto md:bottom-auto md:left-4 md:top-32 md:max-h-[calc(100vh-10rem)] md:w-[380px] md:rounded-3xl"
        >
          <div
            className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-400/50 md:hidden"
            aria-hidden
          />
          <div className="flex items-start gap-3">
            <span
              className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
              style={{ background: CAT_COLOR[p.category] }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold leading-tight text-[var(--ink)]">
                {p.shortName}
              </h2>
              {p.name !== p.shortName && <p className="text-sm text-[var(--ink-soft)]">{p.name}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
                  style={{ background: CAT_COLOR[p.category] }}
                >
                  {CAT_LABEL[p.category]}
                </span>
                {p.provisional && (
                  <span className="rounded-full bg-orange-200 px-2.5 py-0.5 text-[11px] font-bold text-orange-900">
                    provisional shape
                  </span>
                )}
                {!p.verified && (
                  <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    unverified
                  </span>
                )}
                {p.offCampus && (
                  <span className="rounded-full bg-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-800">
                    off-campus
                  </span>
                )}
              </div>
            </div>
            <button
              aria-label="Close"
              onClick={() => useApp.getState().select(null)}
              className="chunky p-2 text-lg text-[var(--ink-soft)]"
            >
              ✕
            </button>
          </div>

          <p
            className={`mt-3 text-sm ${p.description === COMING ? 'italic text-[var(--ink-soft)]' : 'text-[var(--ink)]'}`}
          >
            {p.description || COMING}
          </p>
          <dl className="mt-2">
            {!p.flat && <Row label="Floors" value={p.levels} />}
            <Row label="Hours" />
            <Row
              label="Entrance"
              value={p.entrance ? 'Marked on map' : 'Approximate (nearest path)'}
            />
          </dl>

          {near.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--ink-soft)]">
                Nearby
              </h3>
              <ul className="mt-1 flex flex-col">
                {near.map(({ o, d }) => (
                  <li key={o.id}>
                    <button
                      onClick={() => useApp.getState().select(o.id)}
                      className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-black/5"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CAT_COLOR[o.category] }}
                      />
                      <span className="min-w-0 flex-1 truncate">{o.shortName}</span>
                      <span className="text-xs text-[var(--ink-soft)]">
                        {Math.round(d)} m · {Math.max(1, Math.round(d / 78))} min
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                useApp.getState().set({
                  to: {
                    id: p.id,
                    name: p.shortName,
                    pos: p.entrance ?? p.pos,
                    approx: !p.entrance,
                  },
                  navOpen: true,
                });
              }}
              className="chunky col-span-3 bg-blue-600 px-4 py-3 text-[15px] font-extrabold text-white shadow-lg"
            >
              🧭 Navigate here
            </button>
            <button
              onClick={share}
              className="chunky glass col-span-1 px-2 py-2.5 text-sm font-bold text-[var(--ink)]"
            >
              Share
            </button>
            <button
              onClick={() => report(p)}
              className="chunky glass col-span-2 px-2 py-2.5 text-sm font-bold text-[var(--ink)]"
            >
              Report a mistake
            </button>
          </div>

          {debug && (
            <div className="mt-3 rounded-2xl bg-slate-900/90 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
              <div>id: {p.id}</div>
              <div>
                osmId: {p.osmId ?? '—'} · source: {p.source}
              </div>
              <div>
                height: {p.resolvedHeight.toFixed(1)} m · source: {p.heightSource}
                {p.heightEstimated ? ' (ESTIMATED)' : ''}
              </div>
              <div>
                levels: {p.levels ?? '—'} · heightM: {p.heightM ?? '—'}
              </div>
              <div>
                footprints: {p.footprints.length} · entrance: {p.entrance ? 'set' : 'none'}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(landmarkJson(p) + ',')
                    .then(() => useApp.getState().setToast('Landmark JSON copied'));
                }}
                className="chunky mt-2 w-full bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-900"
              >
                Copy landmark JSON
              </button>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(heightJson(p) + ',')
                    .then(() => useApp.getState().setToast('Height JSON copied'));
                }}
                className="chunky mt-2 w-full bg-sky-400 px-3 py-2 text-xs font-extrabold text-slate-900"
              >
                Copy height JSON
              </button>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
