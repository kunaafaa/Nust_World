import { describe, expect, it } from 'vitest';
import { createSearch } from '@/lib/search';
import type { Place } from '@/lib/types';

const mk = (
  id: string,
  shortName: string,
  aliases: string[],
  category: Place['category'] = 'academic',
): Place => ({
  id,
  source: 'landmark',
  name: shortName,
  shortName,
  category,
  aliases,
  description: '',
  verified: false,
  offCampus: false,
  pos: [0, 0],
  footprints: [],
  resolvedHeight: 9,
  heightSource: 'test',
  heightEstimated: false,
  flat: false,
});
const places = [
  mk('seecs', 'SEECS', ['SEECS', 'CS dept', 'computer science']),
  mk('library', 'Central Library', ['library', 'lib']),
  mk('masjid', 'Masjid', ['mosque'], 'prayer'),
  mk('c1', 'Concordia-1', ['concordia'], 'food'),
];
const s = createSearch(places);

describe('search', () => {
  it('matches aliases', () => expect(s.query('cs dept')[0].id).toBe('seecs'));
  it('handles typos', () => expect(s.query('libary')[0].id).toBe('library'));
  it('handles shorthand', () => expect(s.query('computer scince')[0].id).toBe('seecs'));
  it('category words', () => expect(s.query('mosque')[0].id).toBe('masjid'));
  it('empty query returns nothing', () => expect(s.query('  ')).toEqual([]));
});
