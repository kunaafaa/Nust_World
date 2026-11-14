import { describe, expect, it } from 'vitest';
import {
  categoryAnchor,
  filterMenu,
  formatPrice,
  formatUpdated,
  formatVariants,
  itemCount,
  loadMenu,
  menuLabel,
  type Menu,
} from '../src/lib/menu';

const cats = [
  {
    name: 'BBQ',
    items: [
      { id: '1', name: 'Chicken Tikka', price: 350, available: true },
      { id: '2', name: 'Malai Boti', price: 380, available: false, description: 'creamy' },
    ],
  },
  { name: 'Shakes', items: [{ id: '3', name: 'Oreo Shake', price: 1200, available: true }] },
];

describe('price formatting', () => {
  it('uses plain grouped numbers (currency is shown once, not per row)', () => {
    expect(formatPrice(350)).toBe('350');
    expect(formatPrice(1200)).toBe('1,200');
    expect(formatPrice(99.5)).toBe('99.5');
    expect(formatPrice(0)).toBe('0');
  });
  it('formats variants inline', () => {
    expect(
      formatVariants([
        { label: 'Small', price: 250 },
        { label: 'Large', price: 1350 },
      ]),
    ).toBe('Small 250 · Large 1,350');
  });
});

describe('menu helpers', () => {
  it('labels the pill', () => {
    expect(menuLabel(216)).toBe('Menu · 216 items');
    expect(menuLabel(1)).toBe('Menu · 1 item');
  });
  it('formats the date in UTC', () => {
    expect(formatUpdated('2026-11-14T23:30:00.000Z')).toBe('14 Nov 2026');
    expect(formatUpdated('nope')).toBe('');
  });
  it('filters by every word across name, description and category; drops empty categories', () => {
    expect(filterMenu(cats, '')).toBe(cats);
    expect(filterMenu(cats, 'boti').map((c) => c.name)).toEqual(['BBQ']);
    expect(filterMenu(cats, 'shakes oreo')[0].items).toHaveLength(1);
    expect(filterMenu(cats, 'creamy')[0].items[0].name).toBe('Malai Boti');
    expect(filterMenu(cats, 'pizza')).toEqual([]);
  });
  it('builds safe anchors', () => {
    expect(categoryAnchor('c1', 'Roll Paratha')).toBe('menu-c1-roll-paratha');
  });
  it('counts items', () => {
    expect(itemCount({ categories: cats } as Menu)).toBe(3);
  });
});

describe('shipped menus', () => {
  it('c1..c3 load, are PKR, have positive integer prices and unique ids', async () => {
    for (const id of ['c1', 'c2', 'c3']) {
      const m = await loadMenu(id);
      expect(m?.cafeId).toBe(id);
      expect(m?.currency).toBe('PKR');
      const items = m!.categories.flatMap((c) => c.items);
      expect(items.length).toBeGreaterThan(25);
      expect(items.every((i) => Number.isInteger(i.price) && i.price > 0)).toBe(true);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    }
  });
  it('unknown ids have no menu', async () => {
    expect(await loadMenu('zzz')).toBeNull();
  });
});

describe('landmark links', () => {
  it('C1/C2/C3 point at menus that exist, with searchable aliases', async () => {
    const { landmarks } = await import('../src/data/landmarks');
    const { MENU_IDS } = await import('../src/lib/menu');
    const want: Record<number, [string, string]> = {
      208966900: ['c1', 'C1'],
      209650351: ['c2', 'C2'],
      1256889785: ['c3', 'C3'],
    };
    for (const [osm, [menuId, alias]] of Object.entries(want)) {
      const lm = landmarks.find((l) => l.osmId === Number(osm))!;
      expect(lm.menuId).toBe(menuId);
      expect(lm.aliases).toContain(alias);
      expect(lm.category).toBe('food');
      expect(MENU_IDS).toContain(menuId);
    }
    expect(landmarks.filter((l) => l.menuId)).toHaveLength(3);
  });
});
