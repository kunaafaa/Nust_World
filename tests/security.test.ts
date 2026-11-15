import { beforeEach, describe, expect, it } from 'vitest';
import { sanitizeAnalyticsUrl } from '@/lib/security/analytics';
import { checkDraft, checkFood, checkReport } from '@/lib/reviews/validate';
import { CLIENT_WRITE_LIMIT, resetWriteSlots, takeWriteSlot } from '@/lib/reviews/client';
import { isAllowedEmail } from '@/lib/reviews/config';
import { readIdList } from '@/lib/storage';

describe('analytics URLs', () => {
  it('keep only the path and a valid place id', () => {
    expect(sanitizeAnalyticsUrl('https://x.app/?place=c1&code=SECRET&debug=1#t')).toBe(
      'https://x.app/?place=c1',
    );
    expect(sanitizeAnalyticsUrl('https://x.app/?code=abc')).toBe('https://x.app/');
    expect(sanitizeAnalyticsUrl('https://x.app/?place=<b>')).toBe('https://x.app/');
    expect(sanitizeAnalyticsUrl('not a url')).toBe('/');
  });
});

describe('review payload checks', () => {
  const ok = { placeId: 'concordia-1-6900', displayName: ' Ali ', rating: 4, body: ' Good ' };
  it('trims and accepts a normal review', () => {
    expect(checkDraft(ok)).toEqual({ ...ok, displayName: 'Ali', body: 'Good' });
  });
  it('refuses oversized or malformed payloads', () => {
    expect(() => checkDraft({ ...ok, body: 'x'.repeat(501) })).toThrow();
    expect(() => checkDraft({ ...ok, displayName: 'x'.repeat(41) })).toThrow();
    expect(() => checkDraft({ ...ok, rating: 4.5 })).toThrow();
    expect(() => checkDraft({ ...ok, rating: 9 })).toThrow();
    expect(() => checkDraft({ ...ok, placeId: '../x' })).toThrow();
    expect(() => checkReport('m1', 'x'.repeat(201))).toThrow();
    expect(() => checkReport('id; drop', '')).toThrow();
    expect(() => checkFood('c1', 'c2/tea', 3)).toThrow();
    expect(() => checkFood('c1', 'c1/tea', 0)).toThrow();
    expect(() => checkFood('c1', 'c1/tea', 5)).not.toThrow();
  });
  it('caps the email length', () => {
    expect(isAllowedEmail(`${'a'.repeat(260)}@nust.edu.pk`, ['nust.edu.pk'])).toBe(false);
  });
});

describe('client write budget', () => {
  beforeEach(() => resetWriteSlots());
  it('allows a burst up to the limit, then refuses until the window passes', () => {
    const t = 1_000_000;
    for (let i = 0; i < CLIENT_WRITE_LIMIT.max; i++) expect(takeWriteSlot(t + i)).toBe(true);
    expect(takeWriteSlot(t + 100)).toBe(false);
    expect(takeWriteSlot(t + CLIENT_WRITE_LIMIT.windowMs + 10)).toBe(true);
  });
});

describe('storage', () => {
  it('returns [] for missing, corrupt or wrongly shaped values', () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Pick<Storage, 'getItem'> }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
    };
    expect(readIdList('a')).toEqual([]);
    store.set('a', '{bad json');
    expect(readIdList('a')).toEqual([]);
    store.set('a', '{"x":1}');
    expect(readIdList('a')).toEqual([]);
    store.set('a', '["c1", 5, null, "seecs"]');
    expect(readIdList('a')).toEqual(['c1', 'seecs']);
  });
});
