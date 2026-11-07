'use client';
import { useMemo } from 'react';
import { usePlaces } from '@/hooks/usePlaces';
import { CAT_COLOR, CAT_LABEL } from '@/lib/colors';
import type { Category } from '@/lib/types';
import { useApp } from '@/store/useApp';

const ORDER: Category[] = [
  'academic',
  'hostel',
  'food',
  'sports',
  'admin',
  'prayer',
  'gate',
  'parking',
  'atm',
  'other',
];

export function CategoryChips() {
  const { places } = usePlaces();
  const active = useApp((s) => s.category);
  const hide = useApp((s) => s.interacting || s.searchOpen);
  const counts = useMemo(() => {
    const c: Partial<Record<Category, number>> = {};
    for (const p of places) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [places]);
  return (
    <div
      className={`scroll-hide pointer-events-auto -mx-1 flex gap-2 overflow-x-auto px-1 transition-opacity duration-300 ${hide ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="group"
      aria-label="Filter places by category"
    >
      {ORDER.filter((c) => counts[c]).map((c) => {
        const on = active === c;
        return (
          <button
            key={c}
            aria-pressed={on}
            onClick={() =>
              useApp.setState({
                category: on ? null : c,
                selectedId: on ? useApp.getState().selectedId : null,
              })
            }
            className="chunky glass flex h-8 shrink-0 items-center gap-1.5 !rounded-full !bg-[var(--glass)] px-3 text-[12px] font-bold text-[var(--ink)] opacity-90"
            style={
              on
                ? { background: CAT_COLOR[c], color: '#fff', borderColor: CAT_COLOR[c] }
                : undefined
            }
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: on ? '#fff' : CAT_COLOR[c] }}
            />
            {CAT_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}
