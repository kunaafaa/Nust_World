'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { usePlaces } from '@/hooks/usePlaces';
import { CAT_COLOR, CAT_LABEL } from '@/lib/colors';
import type { Place } from '@/lib/types';
import { useApp } from '@/store/useApp';

const RECENT_KEY = 'nw-recent';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function SearchBar({
  onPick,
  placeholder = 'Search SEECS, library, hostel…',
  autoSelect = true,
}: {
  onPick?: (p: Place) => void;
  placeholder?: string;
  autoSelect?: boolean;
}) {
  const { places, search } = usePlaces();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  // localStorage is only readable after mount (hydration-safe).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecent(loadRecent()), []);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);

  const results: Place[] = q.trim()
    ? search.query(q, 7)
    : recent
        .map((id) => places.find((p) => p.id === id))
        .filter((p): p is Place => !!p)
        .slice(0, 5);

  const pick = (p: Place) => {
    const next = [p.id, ...recent.filter((x) => x !== p.id)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (q.trim()) track('search', { q: p.shortName });
    setQ('');
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
    if (autoSelect) useApp.getState().select(p.id);
    onPick?.(p);
  };

  return (
    <div ref={box} className="relative w-full">
      <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
        <span aria-hidden className="text-lg">
          🔎
        </span>
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search places"
          value={q}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
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
            else if (e.key === 'Escape') setOpen(false);
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[var(--ink)] outline-none placeholder:font-medium placeholder:text-[var(--ink-soft)]"
        />
        {q && (
          <button
            aria-label="Clear search"
            onClick={() => setQ('')}
            className="px-1 text-[var(--ink-soft)]"
          >
            ✕
          </button>
        )}
      </div>
      {open && (results.length > 0 || q.trim()) && (
        <ul
          id={listId}
          role="listbox"
          className="glass absolute left-0 right-0 top-full z-30 mt-2 max-h-[50vh] overflow-auto rounded-2xl p-1.5"
        >
          {!q.trim() && (
            <li className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-soft)]">
              Recent
            </li>
          )}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi}>
              <button
                onClick={() => pick(p)}
                onPointerEnter={() => setHi(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === hi ? 'bg-blue-500/15' : ''}`}
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
                    <span className="block truncate text-xs text-[var(--ink-soft)]">{p.name}</span>
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
  );
}
