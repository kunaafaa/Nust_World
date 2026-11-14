'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  categoryAnchor,
  filterMenu,
  formatPrice,
  formatUpdated,
  formatVariants,
  itemCount,
  menuLabel,
  type Menu,
  type MenuItem,
} from '@/lib/menu';
import type { MenuState } from '@/hooks/useMenu';
import { MENU_THEME } from '@/scene/theme';
import { useApp } from '@/store/useApp';

/** Height (px) of the sticky chip bar; category headers stick right below it. Keep in sync with .menu-chips in globals.css. */
const CHIP_H = 52;
const SEARCH_FROM = 25; // search box only for menus with more items than this

/** CSS variables for the menu look: every colour/ease/duration comes from scene/theme.ts. */
export function useMenuVars(): React.CSSProperties {
  const night = useApp((s) => s.night);
  return {
    '--m-accent': night ? MENU_THEME.accent : MENU_THEME.accentDay,
    '--m-ease': MENU_THEME.ease,
    '--m-dur': MENU_THEME.durFast,
    '--m-pulse': MENU_THEME.durPulse,
    '--m-chip-h': `${CHIP_H}px`,
  } as React.CSSProperties;
}

/** "Menu · N items" pill for the card header (peek). Skeleton while the chunk loads. */
export function MenuPill({ state }: { state: MenuState }) {
  const vars = useMenuVars();
  if (state.status === 'loading')
    return <span className="menu-pill menu-skel" style={vars} aria-label="Loading menu" />;
  if (state.status !== 'ready') return null;
  return (
    <span className="menu-pill" style={vars}>
      {menuLabel(itemCount(state.menu))}
    </span>
  );
}

function Row({ item }: { item: MenuItem }) {
  const hasVariants = !!item.variants?.length;
  return (
    <li className={`menu-row ${item.available ? '' : 'menu-row-off'}`}>
      <div className="min-w-0 flex-1">
        <p className="menu-name">{item.name}</p>
        {item.description && <p className="menu-desc">{item.description}</p>}
        {hasVariants && <p className="menu-variants">{formatVariants(item.variants!)}</p>}
        {(item.tags?.length || !item.available) && (
          <p className="menu-tags">
            {!item.available && <span className="menu-tag">Not available</span>}
            {item.tags?.map((t) => (
              <span key={t} className="menu-tag">
                {t}
              </span>
            ))}
          </p>
        )}
      </div>
      {!hasVariants && <span className="menu-price">{formatPrice(item.price)}</span>}
    </li>
  );
}

function Skeleton() {
  return (
    <div className="menu-skeleton" aria-hidden>
      <div className="menu-skel-chips">
        {[64, 88, 72, 80].map((w, i) => (
          <span key={i} className="menu-skel menu-skel-chip" style={{ width: w }} />
        ))}
      </div>
      {[70, 54, 82, 62, 76, 58].map((w, i) => (
        <div key={i} className="menu-skel-row">
          <span className="menu-skel menu-skel-bar" style={{ width: `${w}%` }} />
          <span className="menu-skel menu-skel-price" />
        </div>
      ))}
    </div>
  );
}

function Loaded({ menu }: { menu: Menu }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(menu.categories[0]?.name ?? '');
  const root = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const count = itemCount(menu);
  const snap = useApp((st) => st.cardSnap);
  // short screens: keep the half-height sheet for chips + rows; the search box joins at full height
  const roomy = snap === 'full' || window.innerHeight >= 700;
  const searchable = count > SEARCH_FROM && (roomy || query !== '');
  const cats = useMemo(() => filterMenu(menu.categories, query), [menu, query]);

  const scroller = useCallback(
    () => root.current?.closest<HTMLElement>('[data-sheet-body]') ?? null,
    [],
  );

  // Highlight the chip of the category currently under the sticky bar.
  useEffect(() => {
    const sc = scroller();
    const el = root.current;
    if (!sc || !el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = sc.getBoundingClientRect().top + CHIP_H + 8;
      let cur = '';
      for (const b of el.querySelectorAll<HTMLElement>('[data-cat]')) {
        if (b.getBoundingClientRect().top <= top) cur = b.dataset.cat ?? cur;
        else break;
      }
      setActive((a) => (cur && cur !== a ? cur : a));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scroller, cats]);

  // Keep the active chip in view inside the chip row (horizontal only: never scroll the page or sheet).
  useEffect(() => {
    const bar = chips.current;
    const chip = bar?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!bar || !chip) return;
    const l = chip.offsetLeft - 16;
    const r = chip.offsetLeft + chip.offsetWidth + 16;
    if (l < bar.scrollLeft) bar.scrollLeft = l;
    else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth;
  }, [active]);

  const jump = (name: string) => {
    const sc = scroller();
    const block = root.current?.querySelector<HTMLElement>(`[data-cat="${CSS.escape(name)}"]`);
    if (!sc || !block) return;
    setActive(name);
    const dy = block.getBoundingClientRect().top - sc.getBoundingClientRect().top - CHIP_H;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ top: sc.scrollTop + dy, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div ref={root}>
      <div
        ref={chips}
        className="menu-chips scroll-hide"
        data-hscroll
        role="tablist"
        aria-label="Menu categories"
      >
        {cats.map((c) => (
          <button
            key={c.name}
            role="tab"
            aria-selected={c.name === active}
            aria-current={c.name === active ? 'true' : undefined}
            onClick={() => jump(c.name)}
            className={`menu-chip ${c.name === active ? 'menu-chip-on' : ''}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {searchable && (
        <div className="menu-search">
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${count} items`}
            aria-label="Search the menu"
            autoComplete="off"
            data-nodrag
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="menu-search-x"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {cats.length === 0 ? (
        <p className="menu-empty">No items match “{query.trim()}”</p>
      ) : (
        cats.map((c) => (
          <div key={c.name} data-cat={c.name} id={categoryAnchor(menu.cafeId, c.name)}>
            <h3 className="menu-cat">{c.name}</h3>
            <ul>
              {c.items.map((i) => (
                <Row key={`${c.name}-${i.id}`} item={i} />
              ))}
            </ul>
          </div>
        ))
      )}

      {formatUpdated(menu.updatedAt) && (
        <p className="menu-updated">Menu updated {formatUpdated(menu.updatedAt)}</p>
      )}
    </div>
  );
}

/** The menu block of a cafe's place card. `soon` = a food place with no menu data. */
export function MenuSection({ state, soon }: { state: MenuState; soon?: boolean }) {
  const vars = useMenuVars();
  if (state.status === 'none' && !soon) return null;
  return (
    <section className="menu" style={vars} aria-label="Menu">
      {state.status === 'loading' && <Skeleton />}
      {state.status === 'ready' && <Loaded key={state.menu.cafeId} menu={state.menu} />}
      {(state.status === 'missing' || (state.status === 'none' && soon)) && (
        <p className="menu-soon">Menu coming soon</p>
      )}
    </section>
  );
}
