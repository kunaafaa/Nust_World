/** Reviews and food ratings: shared types, limits and the storage interface (Supabase or in-memory). */
import type { Category } from '@/lib/types';

/** Never reviewable: the database enforces the same through public.excluded_places. */
export const REVIEW_EXCLUDED_CATEGORIES: readonly Category[] = ['prayer', 'medical'];

export const REVIEW_LIMITS = {
  bodyMax: 500,
  nameMin: 2,
  nameMax: 40,
  reasonMax: 200,
  /** a food rating pill only appears from this many ratings */
  foodMinCount: 3,
  /** summaries and lists are re-fetched after this long */
  cacheMs: 5 * 60_000,
} as const;

export const REVIEW_POLICY =
  'Reviews are about places and food only. Do not name or describe people, and leave out links, emails and phone numbers. We store your user id, the display name you choose and what you write, nothing else. You can delete all of it at any time.';

export interface Review {
  id: string;
  placeId: string;
  displayName: string;
  rating: number;
  body: string;
  createdAt: string;
  /** written by the signed-in user */
  mine: boolean;
}

export interface Summary {
  avg: number;
  count: number;
}

export interface ReviewUser {
  id: string;
  email: string;
}

export interface ReviewDraft {
  placeId: string;
  displayName: string;
  rating: number;
  body: string;
}

/** Everything the UI needs. Implementations: SupabaseStore (real) and MemoryStore (tests, demos). */
export interface ReviewStore {
  readonly kind: 'supabase' | 'memory';
  /** current user, or null when signed out */
  user(): Promise<ReviewUser | null>;
  onAuthChange(cb: (u: ReviewUser | null) => void): () => void;
  /** send a magic link; resolves when the email is on its way */
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;

  placeSummary(placeId: string): Promise<Summary | null>;
  placeReviews(placeId: string): Promise<Review[]>;
  saveReview(d: ReviewDraft): Promise<void>;
  deleteReview(id: string): Promise<void>;
  reportReview(id: string, reason: string): Promise<void>;

  /** item key -> summary, every rated item of one cafe */
  foodSummaries(cafeId: string): Promise<Record<string, Summary>>;
  /** item key -> the signed-in user's rating */
  myFoodRatings(cafeId: string): Promise<Record<string, number>>;
  rateFood(cafeId: string, itemKey: string, rating: number): Promise<void>;

  deleteMyData(): Promise<void>;
}

/** A user-facing failure (rate limit, refused text, offline...). `message` is safe to show. */
export class ReviewError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'offline'
      | 'auth'
      | 'domain'
      | 'text'
      | 'rate'
      | 'excluded'
      | 'invalid'
      | 'server' = 'server',
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}
