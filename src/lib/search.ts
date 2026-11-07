import Fuse from 'fuse.js';
import type { Category, Place } from './types';

export const CATEGORY_LABELS: Record<Category, string> = {
  academic: 'Academic',
  hostel: 'Hostels',
  food: 'Food',
  sports: 'Sports',
  admin: 'Admin',
  gate: 'Gates',
  prayer: 'Prayer',
  parking: 'Parking',
  medical: 'Medical',
  atm: 'ATMs/Banks',
  other: 'Other',
};

/** Shorthand people actually type, mapped onto a category. */
const CATEGORY_WORDS: Record<string, Category> = {
  hostel: 'hostel',
  hostels: 'hostel',
  food: 'food',
  eat: 'food',
  cafe: 'food',
  cafes: 'food',
  mess: 'food',
  sports: 'sports',
  gym: 'sports',
  mosque: 'prayer',
  masjid: 'prayer',
  prayer: 'prayer',
  atm: 'atm',
  bank: 'atm',
  parking: 'parking',
  gate: 'gate',
  gates: 'gate',
  medical: 'medical',
  admin: 'admin',
};

export interface SearchIndex {
  query(q: string, limit?: number): Place[];
}

/** Pass only places that should be searchable (callers drop off-campus entries unless debugging). */
export function createSearch(places: Place[]): SearchIndex {
  const fuse = new Fuse(places, {
    keys: [
      { name: 'shortName', weight: 3 },
      { name: 'aliases', weight: 3 },
      { name: 'name', weight: 2 },
      { name: 'category', weight: 0.5 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
  });
  return {
    query(q, limit = 8) {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const exact = places.filter(
        (p) => p.shortName.toLowerCase() === s || p.aliases?.some((a) => a.toLowerCase() === s),
      );
      const catWord = CATEGORY_WORDS[s];
      const byCat = catWord ? places.filter((p) => p.category === catWord) : [];
      const fuzzy = fuse.search(s, { limit: limit * 2 }).map((r) => r.item);
      const seen = new Set<string>();
      const out: Place[] = [];
      for (const p of [...exact, ...byCat, ...fuzzy]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}
