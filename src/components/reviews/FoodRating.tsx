'use client';
import { useState } from 'react';
import { REVIEW_LIMITS, type Summary } from '@/lib/reviews/types';
import type { MenuItem } from '@/lib/menu';
import type { FoodRatings } from './useFoodRatings';
import { StarInput, useReviewVars } from './Stars';

/** "★ 4.7 (3)": only from REVIEW_LIMITS.foodMinCount ratings, so one opinion never looks like a verdict. */
export function FoodPill({ s }: { s: Summary | undefined }) {
  if (!s || s.count < REVIEW_LIMITS.foodMinCount) return null;
  return (
    <span
      className="rv-pill"
      aria-label={`Rated ${s.avg.toFixed(1)} out of 5 from ${s.count} ratings`}
    >
      <span aria-hidden>★</span> {s.avg.toFixed(1)} <span className="rv-pill-n">({s.count})</span>
    </span>
  );
}

/** Pill + "Rate" toggle + inline five-star rater for one menu row. */
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
          className="rv-rate-btn"
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
          <StarInput
            value={my}
            label={`Rate ${item.name}`}
            onChange={async (n) => {
              const err = await fr.rate(key, n);
              setMsg(err ?? 'Thanks for rating');
              if (!err) setOpen(false);
            }}
          />
        ) : (
          <p className="rv-note">
            <button
              className="rv-link"
              onClick={() =>
                document
                  .querySelector('[data-reviews-signin] input')
                  ?.closest('form')
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }
            >
              Sign in under Reviews
            </button>{' '}
            to rate.
          </p>
        ))}
      {msg && (
        <p className="rv-note" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
