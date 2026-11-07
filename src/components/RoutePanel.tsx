'use client';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { locateThen } from '@/hooks/useLocation';
import { cameraCommands } from '@/scene/CameraRig';
import { useApp } from '@/store/useApp';
import { usePlaces } from '@/hooks/usePlaces';
import { SearchBar } from './SearchBar';

export function RoutePanel() {
  const open = useApp((s) => s.navOpen);
  const from = useApp((s) => s.from);
  const to = useApp((s) => s.to);
  const route = useApp((s) => s.route);
  const routing = useApp((s) => s.routing);
  const err = useApp((s) => s.routeError);
  const { places } = usePlaces();
  const gates = places.filter((p) => p.category === 'gate').slice(0, 6);

  useEffect(() => {
    if (route) cameraCommands.fitPoints(route.path);
  }, [route]);

  const locate = () =>
    locateThen((p) => useApp.getState().set({ from: { name: 'My location', pos: p } }));

  const close = () =>
    useApp.getState().set({ navOpen: false, from: null, to: null, route: null, pickMode: null });

  return (
    <AnimatePresence>
      {open && to && (
        <motion.section
          role="dialog"
          aria-label="Walking directions"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="glass fixed inset-x-0 bottom-0 z-20 max-h-[68vh] overflow-y-auto rounded-t-3xl p-4 pb-[calc(1rem+var(--sab))] md:inset-x-auto md:bottom-auto md:left-4 md:top-32 md:max-h-[calc(100vh-10rem)] md:w-[380px] md:rounded-3xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[var(--ink)]">Walking directions</h2>
            <button
              aria-label="Close directions"
              onClick={close}
              className="chunky p-2 text-lg text-[var(--ink-soft)]"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-500 px-2 text-xs font-black text-white">
                A
              </span>
              <span className="font-bold text-[var(--ink)]">{from?.name ?? 'Choose a start…'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-red-500 px-2 text-xs font-black text-white">B</span>
              <span className="font-bold text-[var(--ink)]">{to.name}</span>
            </div>
          </div>
          {!from && (
            <div className="mt-3 space-y-2">
              <SearchBar
                placeholder="Starting point (building, gate…)"
                autoSelect={false}
                onPick={(p) =>
                  useApp
                    .getState()
                    .set({ from: { id: p.id, name: p.shortName, pos: p.entrance ?? p.pos } })
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={locate}
                  className="chunky bg-blue-600 px-3 py-2 text-xs font-extrabold text-white"
                >
                  📍 My location
                </button>
                <button
                  onClick={() => useApp.getState().set({ pickMode: 'from', navOpen: true })}
                  className="chunky glass px-3 py-2 text-xs font-bold text-[var(--ink)]"
                >
                  Tap on map
                </button>
                {gates.map((g) => (
                  <button
                    key={g.id}
                    onClick={() =>
                      useApp.getState().set({ from: { id: g.id, name: g.shortName, pos: g.pos } })
                    }
                    className="chunky glass px-3 py-2 text-xs font-bold text-[var(--ink)]"
                  >
                    I&apos;m at {g.shortName}
                  </button>
                ))}
              </div>
            </div>
          )}
          {from && (
            <div className="mt-3">
              {routing && (
                <p className="text-sm font-semibold text-[var(--ink-soft)]">
                  Finding the best path…
                </p>
              )}
              {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
              {route && (
                <>
                  <p className="text-2xl font-black text-[var(--ink)]">
                    {route.minutes} min{' '}
                    <span className="text-base font-bold text-[var(--ink-soft)]">
                      · {Math.round(route.distance)} m walk
                    </span>
                  </p>
                  <ol className="mt-2 space-y-1.5">
                    {route.steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[var(--ink)]">
                        <span className="mt-0.5 w-5 shrink-0 text-center text-xs font-black text-blue-600">
                          {i + 1}
                        </span>
                        <span>
                          {i > 0 && s.distance > 0 ? <b>{s.distance} m · </b> : null}
                          {s.text}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <button
                onClick={() => useApp.getState().set({ from: null, route: null })}
                className="chunky glass mt-3 px-3 py-2 text-xs font-bold text-[var(--ink)]"
              >
                Change start
              </button>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
