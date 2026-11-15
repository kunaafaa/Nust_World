/**
 * Client-side payload checks before anything is sent. They mirror the column checks in
 * supabase/migrations/001_reviews.sql (the database still enforces them; this just stops oversized or malformed
 * requests from leaving the browser).
 */
import { REVIEW_LIMITS, ReviewError, type ReviewDraft } from './types';

const PLACE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CAFE = /^[a-z0-9-]{1,40}$/;
const ITEM = /^[a-z0-9-]{1,40}\/[a-z0-9~-]{1,120}$/;
/** Supabase ids are uuids; the memory store uses short ids (m1, m2...). */
const REVIEW_ID = /^[a-z0-9-]{1,64}$/i;

const bad = () => new ReviewError('That does not look right.', 'invalid');
const isRating = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

export function checkDraft(d: ReviewDraft): ReviewDraft {
  const displayName = d.displayName.trim();
  const body = d.body.trim();
  if (
    !PLACE.test(d.placeId) ||
    !isRating(d.rating) ||
    displayName.length < REVIEW_LIMITS.nameMin ||
    displayName.length > REVIEW_LIMITS.nameMax ||
    body.length > REVIEW_LIMITS.bodyMax
  )
    throw bad();
  return { placeId: d.placeId, rating: d.rating, displayName, body };
}

export function checkReport(id: string, reason: string): string {
  const r = reason.trim();
  if (!REVIEW_ID.test(id) || r.length > REVIEW_LIMITS.reasonMax) throw bad();
  return r;
}

export function checkFood(cafeId: string, itemKey: string, rating: number): void {
  if (
    !CAFE.test(cafeId) ||
    !ITEM.test(itemKey) ||
    itemKey.split('/')[0] !== cafeId ||
    !isRating(rating)
  )
    throw bad();
}

export function checkPlace(placeId: string): void {
  if (!PLACE.test(placeId)) throw bad();
}
