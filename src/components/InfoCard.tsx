'use client';
import { useEffect, useState } from 'react';
import { track } from '@vercel/analytics';
import { landmarks } from '@/data/landmarks';
import { CAT_COLOR, CAT_LABEL } from '@/lib/colors';
import { unproject } from '@/lib/geo';
import type { Place } from '@/lib/types';
import { haptic } from '@/lib/haptics';
import { useApp } from '@/store/useApp';
import { useMenu } from '@/hooks/useMenu';
import { BottomSheet } from './BottomSheet';
import { MenuPill, MenuSection, useMenuVars } from './MenuSection';

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
  const snap = useApp((s) => s.cardSnap);
  const p = id ? data?.places.find((x) => x.id === id) : null;
  const near = p && data ? nearbyPlaces(p, data.places) : [];
  const open = !!p && !navOpen;
  // keep the last place rendered while the sheet slides away
  const [last, setLast] = useState<Place | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p) setLast(p);
  }, [p]);
  const q = p ?? last;
  const menu = useMenu(q?.menuId);
  const menuVars = useMenuVars();

  const share = async () => {
    if (!q) return;
    const url = `${location.origin}${location.pathname}?place=${q.id}`;
    track('share', { id: q.id });
    try {
      if (navigator.share)
        await navigator.share({
          title: `${q.shortName} — NUST World`,
          text: `Find ${q.shortName} on NUST World`,
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
  const navigate = () => {
    if (!q) return;
    haptic(12);
    useApp.getState().set({
      to: { id: q.id, name: q.shortName, pos: q.entrance ?? q.pos, approx: !q.entrance },
      navOpen: true,
      navSnap: 'peek',
    });
  };
  if (!q) return null;
  const isCafe = q.category === 'food';
  const hasMenu = menu.status !== 'none';
  const sub = [CAT_LABEL[q.category], !q.flat && q.levels ? `${q.levels} floors` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <BottomSheet
      open={open}
      snap={snap}
      onSnap={(s) => useApp.setState({ cardSnap: s })}
      onClose={() => useApp.getState().select(null)}
      label={`${q.name} details`}
      header={
        <div className="flex h-[68px] items-center gap-2.5">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full"
            style={{ background: CAT_COLOR[q.category] }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-extrabold leading-tight text-[var(--ink)]">
              {q.shortName}
            </h2>
            {hasMenu && <span className="menu-rule" style={menuVars} aria-hidden />}
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-soft)]">
              <span className={hasMenu ? 'shrink-0' : 'truncate'}>
                {sub}
                {q.provisional ? ' · provisional shape' : ''}
                {!q.verified && !hasMenu ? ' · unverified' : ''}
              </span>
              {hasMenu && <MenuPill state={menu} />}
            </p>
          </div>
          <button
            aria-label={`Navigate to ${q.shortName}`}
            onClick={navigate}
            className="chunky flex h-11 w-11 shrink-0 items-center justify-center bg-blue-600 text-white shadow-md"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l8 19-8-4-8 4z" />
            </svg>
          </button>
          <button
            aria-label="Close"
            onClick={() => useApp.getState().select(null)}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink-soft)]"
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
      {!(isCafe && q.description === COMING) && (
        <p
          className={`pt-1 text-sm ${q.description === COMING ? 'italic text-[var(--ink-soft)]' : 'text-[var(--ink)]'}`}
        >
          {q.description || COMING}
        </p>
      )}
      <dl className="mt-2">
        {/* cafes with an unknown floor count skip the placeholder row so the menu gets the room */}
        {!q.flat && !(isCafe && q.levels === undefined) && <Row label="Floors" value={q.levels} />}
        <Row label="Hours" />
        {/* cafes: the menu comes straight after the hours, entrance moves below it */}
        {!isCafe && (
          <Row
            label="Entrance"
            value={q.entrance ? 'Marked on map' : 'Approximate (nearest path)'}
          />
        )}
      </dl>
      {isCafe && <MenuSection state={menu} soon />}
      {isCafe && (
        <dl className="mt-2">
          <Row
            label="Entrance"
            value={q.entrance ? 'Marked on map' : 'Approximate (nearest path)'}
          />
        </dl>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={navigate}
          className="chunky col-span-3 min-h-11 bg-blue-600 px-4 py-3 text-[15px] font-extrabold text-white shadow-lg"
        >
          Navigate here
        </button>
        <button
          onClick={share}
          className="chunky glass col-span-1 min-h-11 px-2 py-2.5 text-sm font-bold text-[var(--ink)]"
        >
          Share
        </button>
        <button
          onClick={() => report(q)}
          className="chunky glass col-span-2 min-h-11 px-2 py-2.5 text-sm font-bold text-[var(--ink)]"
        >
          Report a mistake
        </button>
      </div>

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
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-black/5"
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

      {debug && (
        <div className="mt-3 rounded-2xl bg-slate-900/90 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
          <div>id: {q.id}</div>
          <div>
            osmId: {q.osmId ?? '—'} · source: {q.source}
          </div>
          <div>
            height: {q.resolvedHeight.toFixed(1)} m · source: {q.heightSource}
            {q.heightEstimated ? ' (ESTIMATED)' : ''}
          </div>
          <div>
            levels: {q.levels ?? '—'} · heightM: {q.heightM ?? '—'}
          </div>
          <div>
            footprints: {q.footprints.length} · entrance: {q.entrance ? 'set' : 'none'}
          </div>
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(landmarkJson(q) + ',')
                .then(() => useApp.getState().setToast('Landmark JSON copied'));
            }}
            className="chunky mt-2 w-full bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-900"
          >
            Copy landmark JSON
          </button>
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(heightJson(q) + ',')
                .then(() => useApp.getState().setToast('Height JSON copied'));
            }}
            className="chunky mt-2 w-full bg-sky-400 px-3 py-2 text-xs font-extrabold text-slate-900"
          >
            Copy height JSON
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
