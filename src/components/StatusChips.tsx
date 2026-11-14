'use client';
import { useEffect } from 'react';
import { enableLocation } from '@/hooks/useLocation';
import { navDispatch } from '@/lib/navController';
import { navRuntime } from '@/lib/navRuntime';
import { useApp, type Chip } from '@/store/useApp';

/** Resolved chips hide after this long; unresolved (sticky) ones stay until resolved or dismissed. */
const CHIP_MS = 5000;

function ChipView({ c }: { c: Chip }) {
  useEffect(() => {
    if (c.sticky) return;
    const t = setTimeout(() => useApp.getState().setChip(null, c.kind), CHIP_MS);
    return () => clearTimeout(t);
  }, [c]);
  const act = () => {
    const s = useApp.getState();
    if (c.kind === 'locationOff') enableLocation();
    else if (c.kind === 'pickStart' || c.kind === 'offCampus')
      useApp.setState({ startPickerOpen: true, navSnap: s.navOpen ? 'half' : s.navSnap });
  };
  const tappable = c.kind !== 'weakGps';
  return (
    <div
      role="status"
      data-chip={c.kind}
      className="glass pointer-events-auto flex min-h-11 max-w-full items-center gap-1 rounded-full pl-3 pr-1 text-[13px] font-bold text-[var(--ink)]"
    >
      {tappable ? (
        <button onClick={act} className="min-h-11 min-w-0 truncate text-left">
          {c.text}
          {c.action ? (
            <span className="ml-1 text-[var(--accent)] underline">{c.action}</span>
          ) : null}
        </button>
      ) : (
        <span className="min-w-0 truncate">{c.text}</span>
      )}
      <button
        aria-label="Dismiss"
        onClick={() => useApp.getState().setChip(null, c.kind)}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink-soft)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Location / start-point status under the search pill. Never blocks the map: only the chips take taps. */
export function StatusChips() {
  const chips = useApp((s) => s.chips);
  if (!chips.length) return null;
  return (
    <div className="pointer-events-none flex flex-col items-start gap-1.5" data-status-chips>
      {chips.map((c) => (
        <ChipView key={c.kind} c={c} />
      ))}
    </div>
  );
}

/**
 * Mount once. NAV_FREE returns to NAV_FOLLOW after `autoRecentreS` seconds without touching the map (paused while
 * the tab is hidden).
 */
export function useNavAutoRecentre() {
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      const s = useApp.getState();
      if (s.nav !== 'NAV_FREE' || !s.autoRecentreS) return;
      if (performance.now() - navRuntime.lastTouch >= s.autoRecentreS * 1000)
        navDispatch({ type: 'IDLE_TIMEOUT' });
    }, 500);
    return () => clearInterval(id);
  }, []);
}
