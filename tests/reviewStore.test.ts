import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '@/lib/reviews/memoryStore';
import { mapError } from '@/lib/reviews/supabaseStore';
import { REVIEW_EXCLUDED_CATEGORIES, ReviewError } from '@/lib/reviews/types';

const DOM = ['seecs.edu.pk'];
const draft = (
  over: Partial<{ placeId: string; displayName: string; rating: number; body: string }> = {},
) => ({
  placeId: 'concordia-1-6900',
  displayName: 'Student A',
  rating: 4,
  body: 'Good chai',
  ...over,
});

async function signedIn(
  opts: Partial<ConstructorParameters<typeof MemoryStore>[0]> = {},
  email = 'a@seecs.edu.pk',
) {
  const s = new MemoryStore({ domains: DOM, ...opts });
  await s.signIn(email);
  return s;
}

describe('MemoryStore follows the database rules', () => {
  it('refuses signed-out writes and outside domains', async () => {
    const s = new MemoryStore({ domains: DOM });
    await expect(s.saveReview(draft())).rejects.toMatchObject({ code: 'auth' });
    await expect(s.signIn('a@gmail.com')).rejects.toMatchObject({ code: 'domain' });
  });

  it('one review per place and user; editing replaces it', async () => {
    const s = await signedIn();
    await s.saveReview(draft());
    await s.saveReview(draft({ rating: 2, body: 'Changed' }));
    const list = await s.placeReviews('concordia-1-6900');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rating: 2, body: 'Changed', mine: true });
    expect(await s.placeSummary('concordia-1-6900')).toEqual({ avg: 2, count: 1 });
  });

  it('refuses links, phones, blocked words and bad lengths', async () => {
    const s = await signedIn();
    await expect(s.saveReview(draft({ body: 'www.x.com' }))).rejects.toMatchObject({
      code: 'text',
    });
    await expect(s.saveReview(draft({ body: '0300 1234567' }))).rejects.toMatchObject({
      code: 'text',
    });
    await expect(s.saveReview(draft({ displayName: 'sh1t' }))).rejects.toMatchObject({
      code: 'text',
    });
    await expect(s.saveReview(draft({ displayName: 'A' }))).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(s.saveReview(draft({ body: 'a'.repeat(501) }))).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(s.saveReview(draft({ rating: 0 }))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses excluded places', async () => {
    const s = await signedIn({ excludedPlaces: ['central-mosque'] });
    await expect(s.saveReview(draft({ placeId: 'central-mosque' }))).rejects.toMatchObject({
      code: 'excluded',
    });
    expect(REVIEW_EXCLUDED_CATEGORIES).toEqual(['prayer', 'medical']);
  });

  it('rate-limits to 10 writes an hour', async () => {
    let t = 1_000_000;
    const s = await signedIn({ now: () => t });
    for (let i = 1; i <= 10; i++) await s.rateFood('c1', `c1/item-${i}`, 3);
    await expect(s.rateFood('c1', 'c1/item-11', 3)).rejects.toMatchObject({ code: 'rate' });
    t += 3_600_001;
    await s.rateFood('c1', 'c1/item-11', 3);
  });

  it('hides a review after 3 reports from different users; author cannot self-report', async () => {
    const s = new MemoryStore({
      domains: DOM,
      seed: {
        reviews: [
          { placeId: 'p-1', userId: 'user:a@seecs.edu.pk', displayName: 'A', rating: 5, body: '' },
        ],
      },
    });
    await s.signIn('a@seecs.edu.pk');
    const [r] = await s.placeReviews('p-1');
    await expect(s.reportReview(r.id, '')).rejects.toMatchObject({ code: 'invalid' });
    for (const u of ['b', 'c']) {
      await s.signIn(`${u}@seecs.edu.pk`);
      await s.reportReview(r.id, 'off topic');
      await s.reportReview(r.id, 'again'); // a repeat report does not count twice
    }
    expect(await s.placeReviews('p-1')).toHaveLength(1);
    await s.signIn('d@seecs.edu.pk');
    await s.reportReview(r.id, '');
    expect(await s.placeReviews('p-1')).toHaveLength(0);
  });

  it('food summaries, own ratings and the item key check', async () => {
    const s = await signedIn();
    await s.rateFood('c1', 'c1/chai', 4);
    await s.rateFood('c1', 'c1/chai', 5);
    expect(await s.foodSummaries('c1')).toEqual({ 'c1/chai': { avg: 5, count: 1 } });
    expect(await s.myFoodRatings('c1')).toEqual({ 'c1/chai': 5 });
    await expect(s.rateFood('c1', 'c2/chai', 4)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('delete my data removes everything of that user only', async () => {
    const s = new MemoryStore({
      domains: DOM,
      seed: {
        reviews: [{ placeId: 'p-1', userId: 'other', displayName: 'Other', rating: 3, body: '' }],
      },
    });
    await s.signIn('a@seecs.edu.pk');
    await s.saveReview(draft({ placeId: 'p-1' }));
    await s.rateFood('c1', 'c1/chai', 4);
    await s.deleteMyData();
    const left = await s.placeReviews('p-1');
    expect(left.map((r) => r.displayName)).toEqual(['Other']);
    expect(await s.foodSummaries('c1')).toEqual({});
  });
});

describe('Supabase error mapping', () => {
  it('turns database errors into safe messages', () => {
    expect(mapError({ code: 'P0429', message: 'rate limit' }).code).toBe('rate');
    expect(mapError({ code: '23514', message: 'text not allowed: link' }).message).toMatch(/links/);
    expect(mapError({ code: '23514', message: 'this place does not take reviews' }).code).toBe(
      'excluded',
    );
    expect(
      mapError({ code: '42501', message: 'new row violates row-level security policy' }).code,
    ).toBe('domain');
    const e = mapError({ code: 'XX000', message: 'internal: relation secret_table' });
    expect(e).toBeInstanceOf(ReviewError);
    expect(e.message).not.toMatch(/secret_table/);
  });
});

describe('reviews client cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function fresh(search = '?reviews=memory', online = true) {
    vi.stubGlobal('location', { search, href: `http://x/${search}` });
    vi.stubGlobal('navigator', { onLine: online });
    const c = await import('@/lib/reviews/client');
    c.resetReviewsClient();
    return c;
  }

  it('is off without config or the memory switch', async () => {
    const c = await fresh('');
    expect(await c.getStore()).toBeNull();
    expect(await c.cachedRead('k', async () => 1)).toBeNull();
  });

  it('caches reads for 5 minutes', async () => {
    vi.useFakeTimers();
    const c = await fresh();
    const f = vi.fn(async () => 42);
    expect((await c.cachedRead('k1', f))?.value).toBe(42);
    await c.cachedRead('k1', f);
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await c.cachedRead('k1', f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('offline: serves the cache read-only and refuses writes', async () => {
    const c = await fresh();
    await c.cachedRead('k2', async () => 'saved');
    vi.stubGlobal('navigator', { onLine: false });
    expect(await c.cachedRead('k2', async () => 'new', { fresh: true })).toEqual({
      value: 'saved',
      stale: true,
    });
    await expect(c.cachedRead('k3', async () => 1)).rejects.toMatchObject({ code: 'offline' });
    await expect(c.write(async () => {})).rejects.toMatchObject({ code: 'offline' });
  });

  it('a write drops the matching cache entries', async () => {
    const c = await fresh();
    const f = vi.fn(async () => 1);
    await c.cachedRead('rv:p-1:sum', f);
    await c.write(async () => {}, 'rv:p-1:');
    await c.cachedRead('rv:p-1:sum', f);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
