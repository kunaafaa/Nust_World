'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { foodPillLabel, foodPillText, guestNote, type Summary } from '@/lib/reviews/types';
import type { MenuItem } from '@/lib/menu';
import type { FoodRatings } from './useFoodRatings';

// Only loaded when a signed-out person opens a rater (keeps the reviews client out of the menu bundle).
const GuestForm = dynamic(() => import('./GuestForm').then((m) => m.GuestForm), { ssr: false });
import { StarInput, useReviewVars } from './Stars';

/**
 * Everyone's average, from the first rating: "★ 4.2 (12)", and "★ 4.2 (12) · 1 guest" when guests are included.
 * The same for every viewer, whether or not they rated.
 */
export function FoodPill({ s }: { s: Summary | undefined }) {
  if (!s || s.count < 1) return null;
  const { avg, count, guests } = foodPillText(s);
  return (
    <span
      className="rv-pill"
      data-food-avg
      title={s.guestCount ? guestNote(s.guestCount, 'rating') : undefined}
      aria-label={foodPillLabel(s)}
    >
      <span aria-hidden>★</span> {avg}{' '}
      <span className="rv-pill-n" aria-hidden>
        {count}
        {guests}
      </span>
    </span>
  );
}

/**
 * Everyone's average + a smaller "You: 3★" chip (the user's own rating, tap to change) or "Rate" + the inline
 * five-star rater, for one menu row.
 */
export function FoodRatingLine({ item, fr }: { item: MenuItem; fr: FoodRatings }) {
  const vars = useReviewVars();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  if (!fr.enabled || !item.key) return null;
  const key = item.key;
  const my = fr.mine[key] ?? 0;
  return (
    <div className="rv-food" style={vars}>
      <div className="rv-row">
        <FoodPill s={fr.summaries[key]} />
        <button
          className={my ? 'rv-rate-btn rv-mine' : 'rv-rate-btn'}
          aria-expanded={open}
          aria-label={
            my ? `Your rating for ${item.name}: ${my} stars. Change it` : `Rate ${item.name}`
          }
          onClick={() => {
            setMsg('');
            setOpen((o) => !o);
          }}
        >
          {my ? `You: ${my}★` : 'Rate'}
        </button>
      </div>
      {open &&
        (fr.signedIn ? (
          <>
            <StarInput
              value={my}
              label={`Rate ${item.name}`}
              onChange={async (n) => {
                const err = await fr.rate(key, n);
                setMsg(err ?? 'Thanks for rating');
                if (!err) setOpen(false);
              }}
            />
            {!!fr.summaries[key]?.guestCount && (
              <p className="rv-fine">{guestNote(fr.summaries[key].guestCount, 'rating')}</p>
            )}
          </>
        ) : (
          <div className="rv-food-join">
            <GuestForm compact />
            <p className="rv-fine">
              Or{' '}
              <button
                className="rv-link"
                onClick={() =>
                  document
                    .querySelector('[data-reviews-signin] input')
                    ?.closest('form')
                    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                }
              >
                use your NUST email
              </button>{' '}
              (under Reviews) for a NUST badge.
            </p>
          </div>
        ))}
      {msg && (
        <p className="rv-note" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
