import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignItemKeys,
  ITEM_KEY_RE,
  slugify,
  type ItemKeyMap,
  type Menu,
} from '../scripts/lib/menus';
import { DEMO_SEED } from '@/lib/reviews/demoSeed';

const dir = path.resolve(__dirname, '..', 'data', 'menus');
const keyMap = JSON.parse(readFileSync(path.join(dir, 'item-keys.json'), 'utf8')) as ItemKeyMap;
const menus = readdirSync(dir)
  .filter((f) => f.endsWith('.json') && f !== 'item-keys.json')
  .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Menu);

const menu = (cats: [string, string[]][]): Menu => ({
  cafeId: 'cafe',
  name: 'Cafe',
  currency: 'PKR',
  updatedAt: '',
  source: '',
  categories: cats.map(([name, items]) => ({
    name,
    items: items.map((n, i) => ({ id: String(i + 1), name: n, price: 100, available: true })),
  })),
});

describe('food item keys', () => {
  it('slugify', () => {
    expect(slugify('Chicken Tikka (Boti) — Large!')).toBe('chicken-tikka-boti-large');
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
    expect(slugify('***')).toBe('item');
  });

  it('keys survive reordering and new items, and are never reused', () => {
    const a = assignItemKeys(menu([['Tea', ['Chai', 'Green Tea']]]), {});
    expect(a.menu.categories[0].items.map((i) => i.key)).toEqual(['cafe/chai', 'cafe/green-tea']);
    // the site renumbers its ids and adds an item at the top: keys stay
    const b = assignItemKeys(menu([['Tea', ['Kashmiri Chai', 'Chai', 'Green Tea']]]), a.map);
    expect(b.menu.categories[0].items.map((i) => i.key)).toEqual([
      'cafe/kashmiri-chai',
      'cafe/chai',
      'cafe/green-tea',
    ]);
    expect(b.added).toEqual(['cafe/kashmiri-chai']);
    // "Chai" is dropped, later a different "Chai!" appears: it must not inherit the old ratings
    const c = assignItemKeys(menu([['Tea', ['Chai!']]]), b.map);
    expect(c.menu.categories[0].items[0].key).not.toBe('cafe/chai');
  });

  it('same name in two categories gets two keys', () => {
    const r = assignItemKeys(
      menu([
        ['Paratha', ['Aloo']],
        ['Rolls', ['Aloo']],
      ]),
      {},
    );
    const keys = r.menu.categories.map((c) => c.items[0].key);
    expect(keys).toEqual(['cafe/aloo', 'cafe/rolls~aloo']);
  });

  it('every shipped menu item has a valid, unique key that matches item-keys.json', () => {
    for (const m of menus) {
      const seen = new Set<string>();
      for (const c of m.categories)
        for (const i of c.items) {
          expect(i.key, `${m.cafeId} ${c.name} ${i.name}`).toMatch(ITEM_KEY_RE);
          expect(i.key!.startsWith(`${m.cafeId}/`)).toBe(true);
          expect(keyMap[m.cafeId][`${c.name}|${i.name}`]).toBe(i.key);
          seen.add(i.key!);
        }
      expect(seen.size).toBe(m.categories.reduce((n, c) => n + c.items.length, 0));
    }
  });

  it('the demo seed points at real items', () => {
    const all = new Set(
      menus.flatMap((m) => m.categories.flatMap((c) => c.items.map((i) => i.key))),
    );
    for (const f of DEMO_SEED.food ?? []) expect(all.has(f.itemKey), f.itemKey).toBe(true);
  });
});
