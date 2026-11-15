'use client';
/** Food ratings for one cafe menu: public summaries, the user's own ratings and a rate() action. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { reviewsMode } from '@/lib/reviews/config';
import { REVIEW_LIMITS, ReviewError, withMyRating, type Summary } from '@/lib/reviews/types';
import { canWrite, ensureReviewAuth, useReviewAuth } from '@/lib/reviews/useReviewAuth';
import type { MenuItem } from '@/lib/menu';

export interface FoodRatings {
  enabled: boolean;
  /** can rate: a university account, or a guest with a name */
  signedIn: boolean;
  summaries: Record<string, Summary>;
  mine: Record<string, number>;
  rate: (key: string, n: number) => Promise<string | null>;
}

const NONE: FoodRatings = {
  enabled: false,
  signedIn: false,
  summaries: {},
  mine: {},
  rate: async () => null,
};

interface Data {
  summaries: Record<string, Summary>;
  mine: Record<string, number>;
}

export function useFoodRatings(cafeId: string | undefined): FoodRatings {
  const [enabled, setEnabled] = useState(false);
  // one state, so the optimistic update after a rating sees the matching "mine" and summary together
  const [data, setData] = useState<Data>({ summaries: {}, mine: {} });
  const user = useReviewAuth((s) => s.user);
  const writer = useReviewAuth(canWrite);

  useEffect(() => {
    const on = !!cafeId && reviewsMode(location.search) !== 'off';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(on);
    if (on) ensureReviewAuth();
  }, [cafeId]);

  // Only the newest load may set state: an older one finishing late would put stale numbers back.
  const seq = useRef(0);
  const load = useCallback(
    async (fresh: boolean) => {
      if (!cafeId) return;
      const id = ++seq.current;
      const { cachedRead } = await import('@/lib/reviews/client');
      try {
        const s = await cachedRead(`food:${cafeId}:sum`, (st) => st.foodSummaries(cafeId), {
          persist: true,
          fresh,
        });
        const m = user
          ? await cachedRead(`food:${cafeId}:mine:${user.id}`, (st) => st.myFoodRatings(cafeId), {
              fresh,
            })
          : null;
        if (id !== seq.current) return;
        setData({ summaries: s?.value ?? {}, mine: m?.value ?? {} });
      } catch {
        /* offline with nothing cached: the menu simply shows no ratings */
      }
    },
    [cafeId, user],
  );

  useEffect(() => {
    if (!enabled) return;
    // load() sets state only after its awaits, never synchronously in this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
    return () => {
      // cancel: cafe or user changed, or unmounted (a counter, not a DOM ref: bumping the live value is the point)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++;
    };
  }, [enabled, load]);

  // Item key -> the write in flight for it. Rapid taps on the same item collapse into one follow-up write with the
  // last value, and every tap gets that write's real outcome (never a "saved" before it is).
  const inflight = useRef(new Map<string, { want: number; done: Promise<string | null> }>());
  const rate = useCallback(
    (key: string, n: number): Promise<string | null> => {
      if (!cafeId) return Promise.resolve(null);
      const pending = inflight.current;
      const cur = pending.get(key);
      if (cur) {
        cur.want = n;
        return cur.done;
      }
      const job = { want: n, done: Promise.resolve<string | null>(null) };
      pending.set(key, job);
      job.done = (async () => {
        const { write } = await import('@/lib/reviews/client');
        try {
          let sent: number;
          do {
            sent = job.want;
            const value = sent;
            await write((s) => s.rateFood(cafeId, key, value), `food:${cafeId}:`);
          } while (job.want !== sent);
          // show the new average at once; the fresh read below replaces it with the server's numbers
          setData((d) => ({
            mine: { ...d.mine, [key]: sent },
            summaries: {
              ...d.summaries,
              [key]: withMyRating(d.summaries[key], d.mine[key] ?? 0, sent, !!user?.guest),
            },
          }));
          return null;
        } catch (err) {
          return err instanceof ReviewError ? err.message : 'Could not save the rating.';
        } finally {
          pending.delete(key);
          void load(true); // also after a failure: an earlier write of the loop may have landed
        }
      })();
      return job.done;
    },
    [cafeId, user, load],
  );

  if (!enabled) return NONE;
  return { enabled, signedIn: writer, summaries: data.summaries, mine: data.mine, rate };
}

/** Items with enough ratings for "Top rated", best first. */
export function topRated(
  items: MenuItem[],
  summaries: Record<string, Summary>,
  max = 8,
): MenuItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => {
      const s = i.key ? summaries[i.key] : undefined;
      if (!s || s.count < REVIEW_LIMITS.topRatedMinCount || seen.has(i.key!)) return false;
      seen.add(i.key!);
      return true;
    })
    .sort((a, b) => {
      const x = summaries[a.key!];
      const y = summaries[b.key!];
      return y.avg - x.avg || y.count - x.count || a.name.localeCompare(b.name);
    })
    .slice(0, max);
}
