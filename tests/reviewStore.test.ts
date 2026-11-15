import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '@/lib/reviews/memoryStore';
import { mapError } from '@/lib/reviews/supabaseStore';
import {
  foodPillLabel,
  foodPillText,
  REVIEW_EXCLUDED_CATEGORIES,
  REVIEW_LIMITS,
  ReviewError,
  withMyRating,
} from '@/lib/reviews/types';
import { topRated } from '@/components/reviews/useFoodRatings';
import type { MenuItem } from '@/lib/menu';

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
    expect(await s.placeSummary('concordia-1-6900')).toEqual({ avg: 2, count: 1, guestCount: 0 });
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
    expect(await s.foodSummaries('c1')).toEqual({
      'c1/chai': { avg: 5, count: 1, guestCount: 0 },
    });
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

describe('MemoryStore guests', () => {
  const guest = async (opts: Partial<ConstructorParameters<typeof MemoryStore>[0]> = {}) => {
    const s = new MemoryStore({ domains: DOM, ...opts });
    await s.signInAsGuest('Guest Ali');
    return s;
  };

  it('name rules: 2 to 20 characters, text rules, nothing official-looking', async () => {
    const s = new MemoryStore({ domains: DOM });
    for (const bad of [
      'x',
      'abcdefghijklmnopqrstu',
      'NUST Official',
      'adm1n',
      'me@gmail.com',
      'bit.ly/x',
    ])
      await expect(s.signInAsGuest(bad)).rejects.toBeInstanceOf(ReviewError);
    expect(await s.user()).toBeNull();
    await s.signInAsGuest('  Guest Ali ');
    expect(await s.user()).toMatchObject({ guest: true, email: '' });
    expect(await s.guestName()).toBe('Guest Ali');
  });

  it('posts under the profile name, labelled guest; averages count it and say so', async () => {
    const s = await guest({
      seed: {
        reviews: [{ placeId: 'p-1', userId: 'u', displayName: 'Student', rating: 2, body: '' }],
      },
    });
    await s.saveReview(draft({ placeId: 'p-1', displayName: 'Pretend Student', rating: 4 }));
    const list = await s.placeReviews('p-1');
    expect(list.map((r) => [r.displayName, r.author])).toEqual(
      expect.arrayContaining([
        ['Guest Ali', 'guest'],
        ['Student', 'nust'],
      ]),
    );
    expect(await s.placeSummary('p-1')).toEqual({ avg: 3, count: 2, guestCount: 1 });
    await s.rateFood('c1', 'c1/chai', 5);
    expect(await s.foodSummaries('c1')).toEqual({ 'c1/chai': { avg: 5, count: 1, guestCount: 1 } });
  });

  it('stricter write limit: 5 an hour (the name counts as one)', async () => {
    const s = await guest();
    for (let i = 1; i <= 4; i++) await s.rateFood('c1', `c1/item-${i}`, 3);
    await expect(s.rateFood('c1', 'c1/item-5', 3)).rejects.toMatchObject({ code: 'rate' });
  });

  it('guest reports weigh half toward hiding', async () => {
    const s = new MemoryStore({
      domains: DOM,
      seed: {
        reviews: [{ placeId: 'p-1', userId: 'u', displayName: 'Student', rating: 2, body: '' }],
      },
    });
    const id = (await s.placeReviews('p-1'))[0].id;
    for (let i = 1; i <= 6; i++) {
      await s.signOut();
      await s.signInAsGuest(`Guest ${String.fromCharCode(64 + i)}`);
      await s.reportReview(id, '');
      expect((await s.placeReviews('p-1')).length).toBe(i < 6 ? 1 : 0);
    }
  });

  it('upgrading keeps the account: earlier reviews get the NUST label', async () => {
    const s = await guest();
    await s.saveReview(draft({ placeId: 'p-1' }));
    await s.signIn('a@seecs.edu.pk');
    expect(await s.user()).toMatchObject({ guest: false, email: 'a@seecs.edu.pk' });
    const [r] = await s.placeReviews('p-1');
    expect([r.mine, r.author]).toEqual([true, 'nust']);
  });

  it('delete my data removes the name too', async () => {
    const s = await guest();
    await s.saveReview(draft({ placeId: 'p-1' }));
    await s.deleteMyData();
    expect(await s.guestName()).toBeNull();
    expect(await s.placeReviews('p-1')).toEqual([]);
    await expect(s.saveReview(draft({ placeId: 'p-1' }))).rejects.toMatchObject({ code: 'domain' });
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

  it('a read that started before a write does not put its old value back in the cache', async () => {
    const c = await fresh();
    let release!: (v: string) => void;
    const slow = c.cachedRead('food:c9:sum', () => new Promise<string>((r) => (release = r)));
    await Promise.resolve(); // let the read start
    await new Promise((r) => setTimeout(r, 0));
    await c.write(async () => {}, 'food:c9:');
    release('before the write');
    expect((await slow)?.value).toBe('before the write');
    const f = vi.fn(async () => 'after the write');
    expect((await c.cachedRead('food:c9:sum', f))?.value).toBe('after the write');
    expect(f).toHaveBeenCalledTimes(1);
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

describe('food rating pill', () => {
  it('shows the average and count from the first rating', () => {
    expect(foodPillText({ avg: 3, count: 1, guestCount: 0 })).toEqual({
      avg: '3.0',
      count: '(1)',
      guests: '',
    });
    expect(foodPillText({ avg: 4.24, count: 12, guestCount: 0 })).toMatchObject({
      avg: '4.2',
      count: '(12)',
    });
    expect(foodPillLabel({ avg: 3, count: 1, guestCount: 0 })).toBe(
      'Rated 3.0 out of 5 from 1 rating',
    );
  });

  it('says when guests are in the average', () => {
    expect(foodPillText({ avg: 3, count: 1, guestCount: 1 }).guests).toBe(' · 1 guest');
    expect(foodPillText({ avg: 4.2, count: 12, guestCount: 3 }).guests).toBe(' · 3 guests');
    expect(foodPillLabel({ avg: 4.7, count: 3, guestCount: 1 })).toBe(
      'Rated 4.7 out of 5 from 3 ratings, including 1 from guests',
    );
  });

  it('updates the average locally after the user rates or changes a rating', () => {
    // first rating of the item
    expect(withMyRating(undefined, 0, 4, false)).toEqual({ avg: 4, count: 1, guestCount: 0 });
    // a new rating joins the others (guest: counted as a guest)
    expect(withMyRating({ avg: 2, count: 2, guestCount: 1 }, 0, 5, true)).toEqual({
      avg: 3,
      count: 3,
      guestCount: 2,
    });
    // changing a rating replaces it: count and guest count stay
    expect(withMyRating({ avg: 3, count: 3, guestCount: 2 }, 5, 2, true)).toEqual({
      avg: 2,
      count: 3,
      guestCount: 2,
    });
    // own rating known but the summary not loaded yet: treated as a first rating
    expect(withMyRating(undefined, 3, 5, false)).toEqual({ avg: 5, count: 1, guestCount: 0 });
  });

  it('"Top rated" still needs several ratings, though rows show one', () => {
    const item = (key: string): MenuItem => ({
      id: key,
      key,
      name: key,
      price: 1,
      available: true,
    });
    const items = [item('c1/a'), item('c1/b')];
    const top = topRated(items, {
      'c1/a': { avg: 5, count: 1, guestCount: 0 },
      'c1/b': { avg: 4, count: REVIEW_LIMITS.topRatedMinCount, guestCount: 0 },
    });
    expect(top.map((i) => i.key)).toEqual(['c1/b']);
  });
});

describe('MemoryStore food summaries', () => {
  it('a single rating gives a summary, and a second account adds to it', async () => {
    const a = await signedIn();
    await a.rateFood('c2', 'c2/donuts', 3);
    expect((await a.foodSummaries('c2'))['c2/donuts']).toEqual({ avg: 3, count: 1, guestCount: 0 });
    await a.signOut();
    await a.signIn('b@seecs.edu.pk');
    await a.rateFood('c2', 'c2/donuts', 5);
    expect((await a.foodSummaries('c2'))['c2/donuts']).toEqual({ avg: 4, count: 2, guestCount: 0 });
    expect(await a.myFoodRatings('c2')).toEqual({ 'c2/donuts': 5 });
  });
});
