/** Cafe menus: types, formatting and the lazy loader. Data lives in data/menus/<menuId>.json (see `npm run menus`). */

export interface MenuVariant {
  label: string;
  price: number;
}
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  variants?: MenuVariant[];
  available: boolean;
  tags?: string[];
}
export interface MenuCategory {
  name: string;
  items: MenuItem[];
}
export interface Menu {
  cafeId: string;
  name: string;
  currency: string;
  updatedAt: string;
  source: string;
  categories: MenuCategory[];
}

/** Menus ship as separate chunks: nothing here is imported until a cafe card (or the idle warm-up) asks. */
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  c1: () => import('../../data/menus/c1.json'),
  c2: () => import('../../data/menus/c2.json'),
  c3: () => import('../../data/menus/c3.json'),
};
export const MENU_IDS = Object.keys(LOADERS);

const cache = new Map<string, Menu | null>();

/** Already-loaded menu: `undefined` = not loaded yet, `null` = no data for that id. */
export function cachedMenu(menuId: string): Menu | null | undefined {
  return cache.get(menuId);
}

export async function loadMenu(menuId: string): Promise<Menu | null> {
  if (cache.has(menuId)) return cache.get(menuId) ?? null;
  const load = LOADERS[menuId];
  let menu: Menu | null = null;
  if (load) {
    try {
      menu = ((await load()).default as Menu) ?? null;
    } catch {
      return null; // offline and never cached: try again next time rather than remember the failure
    }
  }
  cache.set(menuId, menu);
  return menu;
}

/** Fetch every menu chunk once so the service worker has them for offline use. Call after first load, when idle. */
export function warmMenus(): void {
  for (const id of MENU_IDS) void loadMenu(id);
}

export function itemCount(menu: Menu): number {
  return menu.categories.reduce((n, c) => n + c.items.length, 0);
}

/** 350 -> "350", 1200 -> "1,200", 99.5 -> "99.5". Fixed locale so server, client and tests agree. */
export function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** "Small 250 · Large 350" */
export function formatVariants(v: MenuVariant[]): string {
  return v.map((x) => `${x.label} ${formatPrice(x.price)}`).join(' · ');
}

/** "14 Nov 2026" (UTC, so it does not move with the reader's time zone). */
export function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Menu label for the pill: "Menu · 216 items" ("1 item" for one). */
export function menuLabel(n: number): string {
  return `Menu · ${n} ${n === 1 ? 'item' : 'items'}`;
}

/** Keep items whose name, description or category matches every word typed. Empty categories are dropped. */
export function filterMenu(categories: MenuCategory[], query: string): MenuCategory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return categories;
  return categories
    .map((c) => ({
      ...c,
      items: c.items.filter((i) => {
        const hay =
          `${i.name} ${i.description ?? ''} ${c.name} ${(i.tags ?? []).join(' ')}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((c) => c.items.length > 0);
}

/** Stable DOM id for a category section. */
export function categoryAnchor(menuId: string, name: string): string {
  return `menu-${menuId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
