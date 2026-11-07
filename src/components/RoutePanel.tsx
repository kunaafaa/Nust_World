'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { locateThen } from '@/hooks/useLocation';
import { usePlaces } from '@/hooks/usePlaces';
import { haptic } from '@/lib/haptics';
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

export function RoutePanel() {
  const open = useApp((s) => s.navOpen);
  const snap = useApp((s) => s.navSnap);
  const from = useApp((s) => s.from);
  const to = useApp((s) => s.to);
  const route = useApp((s) => s.route);
  const routing = useApp((s) => s.routing);
  const err = useApp((s) => s.routeError);
  const userPos = useApp((s) => s.userPos);
  const locate = useApp((s) => s.locate);
  const { places } = usePlaces();
  const gates = places.filter((p) => p.category === 'gate').slice(0, 6);
  const [picker, setPicker] = useState(false);
  const [active, setActive] = useState(0);
  const arrived = useRef(false);
  const [startPos, setStartPos] = useState<[number, number] | null>(null);

  // Fit the whole route once when it appears; collapse to the peek bar so the map stays the main view.
  useEffect(() => {
    if (!route) return;
    cameraCommands.fitPoints(route.path);
    arrived.current = false;
    setStartPos(userPos); // eslint-disable-line react-hooks/set-state-in-effect
    useApp.setState({ navSnap: 'peek' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);
  // No start yet: the picker needs room.
  useEffect(() => {
    if (open && to && !from) useApp.setState({ navSnap: 'half' });
  }, [open, to, from]);
  // With live location, follow the blue dot while navigating.
  useEffect(() => {
    if (route && userPos && locate === 'on') useApp.setState({ locate: 'follow' });
  }, [route, userPos, locate]);

  // Which step is next, from where the user is on the path.
  const stepIdx = useMemo(
    () => (route ? route.steps.map((s) => route.path.indexOf(s.at)) : []),
    [route],
  );
  const cur = useMemo(() => {
    if (!route) return 0;
    if (!userPos || locate === 'off') return Math.min(1, route.steps.length - 1);
    let best = 0,
      bd = Infinity;
    route.path.forEach((p, i) => {
      const d = Math.hypot(p[0] - userPos[0], p[1] - userPos[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const nxt = stepIdx.findIndex((k, i) => i > 0 && k > best);
    return nxt < 0 ? route.steps.length - 1 : nxt;
  }, [route, userPos, locate, stepIdx]);
  useEffect(() => setActive(cur), [cur]); // eslint-disable-line react-hooks/set-state-in-effect

  // Arrival: a short toast, not a modal.
  useEffect(() => {
    if (!route || !userPos || locate === 'off' || arrived.current) return;
    const end = route.path[route.path.length - 1];
    if (Math.hypot(end[0] - userPos[0], end[1] - userPos[1]) < 20) {
      arrived.current = true;
      haptic([20, 70, 20]);
      useApp.getState().setToast('You have arrived');
    }
  }, [route, userPos, locate]);

  // Moving and untouched for 4 s: fall back to the peek bar.
  const [touch, setTouch] = useState(0);
  const moved =
    !!userPos && !!startPos && Math.hypot(userPos[0] - startPos[0], userPos[1] - startPos[1]) > 8;
  useEffect(() => {
    if (snap === 'peek' || !route || !moved) return;
    const t = setTimeout(() => useApp.setState({ navSnap: 'peek' }), 4000);
    return () => clearTimeout(t);
  }, [snap, route, moved, touch, userPos]);

  const locateStart = () =>
    locateThen((p) => useApp.getState().set({ from: { name: 'My location', pos: p } }));
  const close = () =>
    useApp.getState().set({ navOpen: false, from: null, to: null, route: null, pickMode: null });
  const swap = () => {
    haptic(10);
    useApp.getState().set({ from: to, to: from });
  };
  const recenter = () => {
    if (userPos && locate !== 'off') useApp.setState({ locate: 'follow' });
    else if (route) cameraCommands.fitPoints(route.path);
  };

  const step = route?.steps[cur];
  const peekText = !to
    ? ''
    : !from
      ? 'Choose a starting point'
      : routing
        ? 'Finding the best path…'
        : (err ??
          (step ? `${cur > 0 && step.distance ? step.distance + ' m · ' : ''}${step.text}` : ''));

  return (
    <>
      <BottomSheet
        open={open && !!to}
        snap={snap}
        peek={122}
        onSnap={(s) => {
          setTouch((n) => n + 1);
          useApp.setState({ navSnap: s });
        }}
        onClose={close}
        label="Walking directions"
        header={
          <div className="pb-1" onPointerDownCapture={() => setTouch((n) => n + 1)}>
            <div className="flex h-11 items-center gap-1">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-extrabold text-[var(--ink)]">
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
              </div>
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
              <button
                aria-label="Re-centre"
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
              <button aria-label="End route" onClick={close} className={iconBtn}>
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
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-blue-600/10 px-2.5 py-2 text-[13px] font-bold text-[var(--ink)]">
                {route && step && <StepIcon text={step.text} size={22} />}
                <span className="min-w-0 flex-1 truncate">{peekText}</span>
              </div>
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
              onClick={() => setPicker(true)}
              className="glass flex h-11 w-full items-center gap-2 rounded-full px-4 text-left text-[15px] font-semibold text-[var(--ink-soft)]"
            >
              Search a starting point
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={locateStart}
                className="chunky min-h-11 bg-blue-600 px-3 py-2 text-xs font-extrabold text-white"
              >
                My location
              </button>
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
                <li key={i}>
                  <button
                    onClick={() => {
                      setActive(i);
                      haptic(8);
                      cameraCommands.centerOn(s.at[0], s.at[1]);
                    }}
                    aria-current={i === active ? 'step' : undefined}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm text-[var(--ink)] ${i === active ? 'bg-blue-600/15 font-extrabold' : 'font-semibold'}`}
                  >
                    <span className="flex w-7 shrink-0 justify-center text-blue-600">
                      <StepIcon text={s.text} size={22} />
                    </span>
                    <span className="min-w-0 flex-1">{s.text}</span>
                    {i > 0 && s.distance > 0 && (
                      <span className="shrink-0 text-xs font-bold text-[var(--ink-soft)]">
                        {s.distance} m
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
            <button
              onClick={() => setPicker(true)}
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
        onClose={() => setPicker(false)}
        placeholder="Starting point (building, gate…)"
        autoSelect={false}
        onPick={(p) =>
          useApp.getState().set({ from: { id: p.id, name: p.shortName, pos: p.entrance ?? p.pos } })
        }
      />
    </>
  );
}
