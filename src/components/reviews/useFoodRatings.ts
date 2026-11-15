'use client';
/** Food ratings for one cafe menu: public summaries, the user's own ratings and a rate() action. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { reviewsMode } from '@/lib/reviews/config';
import { REVIEW_LIMITS, ReviewError, type Summary } from '@/lib/reviews/types';
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

export function useFoodRatings(cafeId: string | undefined): FoodRatings {
  const [enabled, setEnabled] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [mine, setMine] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const user = useReviewAuth((s) => s.user);
  const writer = useReviewAuth(canWrite);

  useEffect(() => {
    const on = !!cafeId && reviewsMode(location.search) !== 'off';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(on);
    if (on) ensureReviewAuth();
  }, [cafeId]);

  useEffect(() => {
    if (!enabled || !cafeId) return;
    let live = true;
    void (async () => {
      const { cachedRead } = await import('@/lib/reviews/client');
      try {
        const s = await cachedRead(`food:${cafeId}:sum`, (st) => st.foodSummaries(cafeId), {
          persist: true,
        });
        const m = user
          ? await cachedRead(`food:${cafeId}:mine:${user.id}`, (st) => st.myFoodRatings(cafeId))
          : null;
        if (!live) return;
        setSummaries(s?.value ?? {});
        setMine(m?.value ?? {});
      } catch {
        /* offline with nothing cached: the menu simply shows no ratings */
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, cafeId, user, tick]);

  // Item key -> the rating wanted while a write for it is in flight. Rapid taps on the same item collapse into one
  // follow-up write with the last value instead of one request per tap.
  const inflight = useRef(new Map<string, number>());
  const rate = useCallback(
    async (key: string, n: number) => {
      if (!cafeId) return null;
      const pending = inflight.current;
      if (pending.has(key)) {
        pending.set(key, n);
        return null;
      }
      pending.set(key, n);
      const { write } = await import('@/lib/reviews/client');
      try {
        let sent: number;
        do {
          sent = pending.get(key)!;
          const value = sent;
          await write((s) => s.rateFood(cafeId, key, value), `food:${cafeId}:`);
        } while (pending.get(key) !== sent);
        setMine((m) => ({ ...m, [key]: sent }));
        setTick((t) => t + 1);
        return null;
      } catch (err) {
        return err instanceof ReviewError ? err.message : 'Could not save the rating.';
      } finally {
        pending.delete(key);
      }
    },
    [cafeId],
  );

  if (!enabled) return NONE;
  return { enabled, signedIn: writer, summaries, mine, rate };
}

/** Rated items (enough ratings to show a pill), best first. */
export function topRated(
  items: MenuItem[],
  summaries: Record<string, Summary>,
  max = 8,
): MenuItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => {
      const s = i.key ? summaries[i.key] : undefined;
      if (!s || s.count < REVIEW_LIMITS.foodMinCount || seen.has(i.key!)) return false;
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
