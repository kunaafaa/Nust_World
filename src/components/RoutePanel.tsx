'use client';
import { memo, useCallback, useEffect, useState } from 'react';
import { usePlaces } from '@/hooks/usePlaces';
import { haptic } from '@/lib/haptics';
import { endNavigation, navDispatch } from '@/lib/navController';
import type { RouteStep } from '@/lib/routing';
import { cameraCommands } from '@/scene/CameraRig';
import { useApp } from '@/store/useApp';
import { BottomSheet } from './BottomSheet';
import { SearchOverlay } from './SearchBar';

/** Turn icon from the step text (steps are landmark-based: "Turn left at X", "Continue past X", "Arrive at X"). */
function StepIcon({ text, size = 26 }: { text: string; size?: number }) {
  const t = text.toLowerCase();
  if (t.startsWith('arrive'))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path
          d="M6 3v18M6 4h12l-3 4 3 4H6z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  if (t.startsWith('start'))
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden
      >
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  const rot = /sharp left/.test(t)
    ? -135
    : /sharp right/.test(t)
      ? 135
      : /left/.test(t)
        ? -90
        : /right/.test(t)
          ? 90
          : 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rot}deg)` }}
      aria-hidden
    >
      <path d="M12 20V5M6 11l6-6 6 6" />
    </svg>
  );
}

const iconBtn =
  'chunky flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink)] active:bg-black/10';

/** One step row. Memoized: when the current step moves, only the two rows whose `active` flag changed re-render. */
const StepRow = memo(function StepRow({
  step,
  i,
  active,
  onPick,
}: {
  step: RouteStep;
  i: number;
  active: boolean;
  onPick: (i: number) => void;
}) {
  return (
    <li className="step-row">
      <button
        onClick={() => onPick(i)}
        aria-current={active ? 'step' : undefined}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm text-[var(--ink)] ${active ? 'bg-blue-600/15 font-extrabold' : 'font-semibold'}`}
      >
        <span className="flex w-7 shrink-0 justify-center text-blue-600">
          <StepIcon text={step.text} size={22} />
        </span>
        <span className="min-w-0 flex-1">{step.text}</span>
        {i > 0 && step.distance > 0 && (
          <span className="shrink-0 text-xs font-bold text-[var(--ink-soft)]">
            {step.distance} m
          </span>
        )}
      </button>
    </li>
  );
});

/** No start after this long (no fix, slow GPS): offer "Pick a starting point" as a chip. */
const START_WAIT_MS = 8000;

export function RoutePanel() {
  const open = useApp((s) => s.navOpen);
  const snap = useApp((s) => s.navSnap);
  const from = useApp((s) => s.from);
  const to = useApp((s) => s.to);
  const route = useApp((s) => s.route);
  const routing = useApp((s) => s.routing);
  const err = useApp((s) => s.routeError);
  const nav = useApp((s) => s.nav);
  const navStep = useApp((s) => s.navStep);
  const picker = useApp((s) => s.startPickerOpen);
  const { places } = usePlaces();
  const gates = places.filter((p) => p.category === 'gate').slice(0, 6);
  const [picked, setPicked] = useState<number | null>(null);
  const navigating = nav === 'NAV_FOLLOW' || nav === 'NAV_FREE' || nav === 'ARRIVED';

  // Route preview: fit the whole route in the map area above the sheet. During navigation a new route is a
  // reroute: the camera keeps following and nothing jumps.
  useEffect(() => {
    if (!route) return;
    if (useApp.getState().nav === 'ROUTE_PREVIEW') cameraCommands.fitPoints(route.path);
    setPicked(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [route]);
  // No start yet: wait a moment for the first fix, then offer a starting point (a chip, never a popup).
  useEffect(() => {
    if (!open || !to || from) {
      useApp.getState().setChip(null, 'pickStart');
      return;
    }
    const t = setTimeout(() => {
      const s = useApp.getState();
      if (s.navOpen && s.to && !s.from)
        s.setChip({ kind: 'pickStart', text: 'Pick a starting point', sticky: true });
    }, START_WAIT_MS);
    return () => clearTimeout(t);
  }, [open, to, from]);

  const active = picked ?? (navigating ? navStep : route ? Math.min(1, route.steps.length - 1) : 0);
  const onPick = useCallback(
    (i: number) => {
      setPicked(i);
      haptic(8);
      const s = route?.steps[i];
      if (!s) return;
      // looking at a step is looking around: navigation continues in NAV_FREE
      if (useApp.getState().nav === 'NAV_FOLLOW') navDispatch({ type: 'GESTURE', kind: 'pan' });
      cameraCommands.centerOn(s.at[0], s.at[1]);
    },
    [route],
  );

  const swap = () => {
    haptic(10);
    useApp.getState().set({ from: to, to: from });
  };
  const recenter = () => {
    if (nav === 'NAV_FREE') navDispatch({ type: 'RECENTRE' });
    else if (nav === 'NAV_FOLLOW') cameraCommands.navFollow(false);
    else if (route) cameraCommands.fitPoints(route.path);
  };
  const start = () => {
    haptic(15);
    navDispatch({ type: 'START' });
  };
  const openPicker = () => useApp.setState({ startPickerOpen: true });

  const step = route?.steps[active];
  const peekText = !to
    ? ''
    : !from
      ? 'Finding your location…'
      : routing
        ? 'Finding the best path…'
        : (err ??
          (step
            ? `${active > 0 && step.distance ? step.distance + ' m · ' : ''}${step.text}`
            : ''));

  return (
    <>
      <BottomSheet
        open={open && !!to}
        snap={snap}
        peek={122}
        onSnap={(s) => useApp.setState({ navSnap: s })}
        onClose={endNavigation}
        label="Walking directions"
        header={
          <div className="pb-1">
            <div className="flex h-11 items-center gap-1">
              <button
                onClick={openPicker}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] font-extrabold text-[var(--ink)]"
                aria-label={`Change start (now ${from?.name ?? 'not set'})`}
              >
                <span className="max-w-[44%] truncate">{from?.name ?? 'Start?'}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-[var(--ink-soft)]"
                  aria-hidden
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
                <span className="truncate">{to?.name}</span>
              </button>
              {!navigating && (
                <button
                  aria-label="Swap start and destination"
                  onClick={swap}
                  disabled={!from}
                  className={`${iconBtn} disabled:opacity-40`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4" />
                  </svg>
                </button>
              )}
              <button
                aria-label={navigating ? 'Re-centre on me' : 'Show the whole route'}
                onClick={recenter}
                disabled={!route}
                className={`${iconBtn} disabled:opacity-40`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
                </svg>
              </button>
              <button aria-label="End route" onClick={endNavigation} className={iconBtn}>
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
            <div className="flex h-[52px] items-center gap-3">
              {route ? (
                <p className="shrink-0 text-[22px] font-black leading-none text-[var(--ink)]">
                  {route.minutes} min
                  <span className="ml-1.5 text-[13px] font-bold text-[var(--ink-soft)]">
                    {Math.round(route.distance)} m
                  </span>
                </p>
              ) : null}
              {nav === 'ROUTE_PREVIEW' && route && from ? (
                <button
                  onClick={start}
                  className="chunky flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white"
                >
                  Start
                </button>
              ) : (
                <div
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-blue-600/10 px-2.5 py-2 text-[13px] font-bold text-[var(--ink)]"
                  aria-live="polite"
                >
                  {route && step && <StepIcon text={step.text} size={22} />}
                  <span className="min-w-0 flex-1 truncate">{peekText}</span>
                </div>
              )}
              <button
                aria-label={snap === 'peek' ? 'Show all steps' : 'Collapse steps'}
                aria-expanded={snap !== 'peek'}
                onClick={() => useApp.setState({ navSnap: snap === 'peek' ? 'half' : 'peek' })}
                className={iconBtn}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: snap === 'peek' ? 'rotate(180deg)' : undefined }}
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        }
      >
        {!from && (
          <div className="space-y-2 pt-2">
            <button
              onClick={openPicker}
              className="glass flex h-11 w-full items-center gap-2 rounded-full px-4 text-left text-[15px] font-semibold text-[var(--ink-soft)]"
            >
              Search a starting point
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => useApp.getState().set({ pickMode: 'from', navOpen: true })}
                className="chunky glass min-h-11 px-3 py-2 text-xs font-bold text-[var(--ink)]"
              >
                Tap on map
              </button>
              {gates.map((g) => (
                <button
                  key={g.id}
                  onClick={() =>
                    useApp.getState().set({ from: { id: g.id, name: g.shortName, pos: g.pos } })
                  }
                  className="chunky glass min-h-11 px-3 py-2 text-xs font-bold text-[var(--ink)]"
                >
                  I&apos;m at {g.shortName}
                </button>
              ))}
            </div>
          </div>
        )}
        {from && route && (
          <>
            <ol className="pt-1">
              {route.steps.map((s, i) => (
                <StepRow key={i} step={s} i={i} active={i === active} onPick={onPick} />
              ))}
            </ol>
            <button
              onClick={openPicker}
              className="chunky glass mt-2 min-h-11 px-3 py-2 text-xs font-bold text-[var(--ink)]"
            >
              Change start
            </button>
          </>
        )}
        {from && !route && err && <p className="pt-2 text-sm font-semibold text-red-600">{err}</p>}
      </BottomSheet>
      <SearchOverlay
        open={picker}
        onClose={() => useApp.setState({ startPickerOpen: false })}
        placeholder="Starting point (building, gate…)"
        autoSelect={false}
        onPick={(p) => {
          const s = useApp.getState();
          s.setChip(null, 'offCampus');
          s.set({ from: { id: p.id, name: p.shortName, pos: p.entrance ?? p.pos } });
        }}
      />
    </>
  );
}
