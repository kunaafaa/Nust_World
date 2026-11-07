'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { locateTap, stopLocation } from '@/hooks/useLocation';
import { useApp } from '@/store/useApp';

const LINKEDIN = 'https://www.linkedin.com/in/muhammad-nawaf-tariq-2033b7415/';
/** Where corrections go. Set NEXT_PUBLIC_FEEDBACK_URL (form, issue tracker, mailto:) to change it. */
const FEEDBACK = process.env.NEXT_PUBLIC_FEEDBACK_URL ?? LINKEDIN;

const fmtDate = (iso?: string) => {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'unknown'
    : d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
};

/** Locate (+ stop) buttons, 44 px, meant to live inside the right-hand control stack. */
export function LocateButton() {
  const mode = useApp((s) => s.locate);
  const label =
    mode === 'off'
      ? 'Show my location'
      : mode === 'on'
        ? 'Follow my location'
        : 'Following. Tap to recentre';
  return (
    <>
      {mode !== 'off' && (
        <button
          aria-label="Stop showing my location"
          onClick={stopLocation}
          className="chunky glass flex h-11 w-11 items-center justify-center text-[var(--ink)]"
        >
          <svg
            width="16"
            height="16"
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
      )}
      <button
        aria-label={label}
        title={label}
        aria-pressed={mode !== 'off'}
        onClick={locateTap}
        className={`chunky glass flex h-11 w-11 items-center justify-center ${mode === 'follow' ? '!bg-blue-500 !text-white' : mode === 'on' ? 'text-blue-500' : 'text-[var(--ink)]'}`}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3.5" fill={mode === 'off' ? 'none' : 'currentColor'} />
          <circle cx="12" cy="12" r="8" />
          <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
        </svg>
      </button>
    </>
  );
}

/**
 * Attribution. The OSM/Overture credit is a licence requirement, so it is always reachable: a small "i" button opens
 * the full attribution, and the one-line credit shows at the very bottom for 5 s after load.
 */
export function Footer() {
  const ts = useApp((s) => s.data?.report.timestamp);
  const sheet = useApp((s) => s.sheetPx > 0);
  const shot = useApp((s) => s.screenshot);
  const [line, setLine] = useState(true);
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(false), 5000);
    return () => clearTimeout(t);
  }, [line]);
  if (shot) return null;
  return (
    <>
      <p
        className={`pointer-events-none absolute inset-x-0 bottom-[calc(0.15rem+var(--sab))] z-10 truncate px-3 text-center text-[9px] leading-tight text-white/70 transition-opacity duration-700 ${line && !sheet ? 'opacity-100' : 'opacity-0'}`}
      >
        © OpenStreetMap contributors · Overture Maps Foundation · terrain/canopy data CC BY 4.0 (per
        the export licence files) · Map data updated {fmtDate(ts)}
      </p>
      {!sheet && (
        <button
          aria-label="About and attribution"
          onClick={() => useApp.setState({ aboutOpen: true })}
          className="glass absolute bottom-[calc(0.75rem+var(--sab))] left-3 z-20 flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)]"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7.5v.01" />
          </svg>
        </button>
      )}
    </>
  );
}

export function About() {
  const open = useApp((s) => s.aboutOpen);
  const ts = useApp((s) => s.data?.report.timestamp);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && useApp.setState({ aboutOpen: false });
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/55 p-3 md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => useApp.setState({ aboutOpen: false })}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="About NUST World"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            className="glass max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl p-5 pb-[calc(1.25rem+var(--sab))] text-[var(--ink)]"
          >
            <h2 className="text-xl font-black">
              NUST <span className="text-amber-500">World</span>
            </h2>
            <p className="mt-1 text-sm">
              Never get lost at NUST again. An unofficial, student-made 3D map of the NUST H-12
              campus.
            </p>
            <p className="mt-3 text-sm font-bold">Made by Nawaf, NUST SEECS</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <a
                  className="font-bold underline"
                  href={LINKEDIN}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  className="font-bold underline"
                  href={FEEDBACK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Suggest a correction
                </a>
              </li>
            </ul>
            <h3 className="mt-4 text-sm font-black">Data</h3>
            <p className="text-xs leading-relaxed">
              Map data from{' '}
              <a
                className="underline"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
              >
                © OpenStreetMap contributors
              </a>{' '}
              (ODbL), last updated {fmtDate(ts)}, plus the{' '}
              <a
                className="underline"
                href="https://overturemaps.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Overture Maps Foundation
              </a>{' '}
              (ODbL) for a few extra building outlines, and terrain/canopy data under CC BY 4.0 (per
              the export licence files) for individual trees and the optional terrain. Because ODbL
              data is merged in, our derived map data is published under ODbL. Building names,
              heights and descriptions are curated by hand. Items marked unverified or provisional
              are not confirmed. No Google Maps data or imagery is used.
            </p>
            <h3 className="mt-3 text-sm font-black">Privacy</h3>
            <p className="text-xs leading-relaxed">
              Your location is used only on your device to show the blue dot and walking directions.
              It is never sent anywhere or stored. Page views are counted with privacy-friendly
              analytics (no cookies, no personal data).
            </p>
            <button
              className="chunky mt-4 w-full rounded-2xl bg-amber-300 py-3 font-black text-slate-900"
              onClick={() => useApp.setState({ aboutOpen: false })}
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Title screen over the cinematic fly-over. Shown once per browser session, skippable. */
export function Title() {
  const phase = useApp((s) => s.phase);
  const start = () => {
    try {
      sessionStorage.setItem('nw-title', '1');
    } catch {
      /* ignore */
    }
    useApp.setState({ phase: 'explore' });
  };
  useEffect(() => {
    if (phase !== 'title') return;
    const k = (e: KeyboardEvent) =>
      (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && start();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [phase]);
  return (
    <AnimatePresence>
      {phase === 'title' && (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col items-center justify-between bg-gradient-to-b from-[#070d1c]/70 via-transparent to-[#070d1c]/85 px-6 pb-[calc(2.5rem+var(--sab))] pt-[calc(4rem+var(--sat))] text-center text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
        >
          <div>
            <h1 className="text-5xl font-black tracking-tight md:text-7xl">
              NUST <span className="text-amber-300">World</span>
            </h1>
            <p className="mt-3 text-lg font-semibold text-white/85 md:text-xl">
              Never get lost at NUST again.
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col items-center gap-3">
            <button
              autoFocus
              onClick={start}
              className="chunky w-full rounded-2xl bg-amber-300 py-4 text-lg font-black text-slate-900"
            >
              Start exploring
            </button>
            <button onClick={start} className="text-sm font-bold text-white/70 underline">
              Skip
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
