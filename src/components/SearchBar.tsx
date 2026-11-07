'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { usePlaces } from '@/hooks/usePlaces';
import { CAT_COLOR, CAT_LABEL } from '@/lib/colors';
import { haptic } from '@/lib/haptics';
import type { Place } from '@/lib/types';
import { useApp } from '@/store/useApp';

const RECENT_KEY = 'nw-recent';
const ROW = 52;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Visual viewport box, so the panel sits above the on-screen keyboard while the map behind does not move. */
function useVisualViewport() {
  const [vv, setVv] = useState({ top: 0, height: 800 });
  useEffect(() => {
    const v = window.visualViewport;
    const read = () => setVv({ top: v?.offsetTop ?? 0, height: v?.height ?? window.innerHeight });
    read();
    v?.addEventListener('resize', read);
    v?.addEventListener('scroll', read);
    window.addEventListener('resize', read);
    return () => {
      v?.removeEventListener('resize', read);
      v?.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, []);
  return vv;
}

/** Expanded search: back arrow, input, clear, and a compact suggestion list (max 5 rows visible, top 40 % of the screen). */
export function SearchOverlay({
  open,
  onClose,
  onPick,
  placeholder = 'Search NUST',
  autoSelect = true,
}: {
  open: boolean;
  onClose: () => void;
  onPick?: (p: Place) => void;
  placeholder?: string;
  autoSelect?: boolean;
}) {
  const { places, search } = usePlaces();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const vv = useVisualViewport();

  // localStorage is only readable after mount (hydration-safe).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecent(loadRecent()), [open]);
  useEffect(() => {
    if (open) input.current?.focus();
    else setQ(''); // eslint-disable-line react-hooks/set-state-in-effect
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  if (!open) return null;
  const results: Place[] = q.trim()
    ? search.query(q, 12)
    : recent
        .map((id) => places.find((p) => p.id === id))
        .filter((p): p is Place => !!p)
        .slice(0, 5);
  const maxList = Math.max(ROW, Math.min(ROW * 5, vv.height * 0.4 - 64));

  const pick = (p: Place) => {
    const next = [p.id, ...recent.filter((x) => x !== p.id)].slice(0, 6);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (q.trim()) track('search', { q: p.shortName });
    haptic(12);
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
    if (autoSelect) useApp.getState().select(p.id);
    onPick?.(p);
  };

  return (
    <>
      {/* transparent catcher: tapping the map closes the search */}
      <div className="fixed inset-0 z-30" onPointerDown={onClose} aria-hidden />
      <div
        className="fixed inset-x-0 z-40 mx-auto flex max-w-xl flex-col gap-2 px-4 md:left-4 md:right-auto md:mx-0 md:w-[412px] md:px-0"
        style={{ top: vv.top + 12 }}
      >
        <div className="glass glass-solid flex h-12 items-center gap-1 rounded-full pl-1 pr-1.5">
          <button
            aria-label="Back"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink)]"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <input
            ref={input}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Search places"
            value={q}
            placeholder={placeholder}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter' && results[hi]) pick(results[hi]);
            }}
            style={{ fontSize: 16 }}
            className="min-w-0 flex-1 bg-transparent font-semibold text-[var(--ink)] outline-none placeholder:font-medium placeholder:text-[var(--ink-soft)]"
          />
          {q && (
            <button
              aria-label="Clear search"
              onClick={() => {
                setQ('');
                input.current?.focus();
              }}
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
          )}
        </div>
        {(results.length > 0 || q.trim()) && (
          <ul
            id={listId}
            role="listbox"
            className="glass glass-solid overflow-y-auto rounded-2xl p-1"
            style={{ maxHeight: maxList, overscrollBehavior: 'contain' }}
          >
            {!q.trim() && (
              <li className="px-3 pb-0.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-soft)]">
                Recent
              </li>
            )}
            {results.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === hi}>
                <button
                  onClick={() => pick(p)}
                  onPointerEnter={() => setHi(i)}
                  style={{ minHeight: ROW - 4 }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 text-left ${i === hi ? 'bg-blue-500/15' : ''}`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: CAT_COLOR[p.category] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-[var(--ink)]">
                      {p.shortName}
                    </span>
                    {p.name !== p.shortName && (
                      <span className="block truncate text-xs text-[var(--ink-soft)]">
                        {p.name}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ink-soft)]">
                    {CAT_LABEL[p.category]}
                  </span>
                </button>
              </li>
            ))}
            {q.trim() && results.length === 0 && (
              <li className="px-3 py-3 text-sm text-[var(--ink-soft)]">
                No match. Try a department or building short name.
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  );
}

/** The slim 44 px pill at the top. Tap to expand. */
export function SearchBar() {
  const open = useApp((s) => s.searchOpen);
  const close = () => useApp.setState({ searchOpen: false });
  return (
    <>
      <button
        aria-label="Search NUST"
        onClick={() => useApp.setState({ searchOpen: true })}
        className={`glass flex h-11 w-full items-center gap-2.5 rounded-full px-4 text-left ${open ? 'invisible' : ''}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="shrink-0 text-[var(--ink-soft)]"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="truncate text-[15px] font-semibold text-[var(--ink-soft)]">
          Search NUST
        </span>
      </button>
      <SearchOverlay open={open} onClose={close} />
    </>
  );
}
