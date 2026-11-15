/** Reviews and food ratings: shared types, limits and the storage interface (Supabase or in-memory). */
import type { Category } from '@/lib/types';

/** Never reviewable: the database enforces the same through public.excluded_places. */
export const REVIEW_EXCLUDED_CATEGORIES: readonly Category[] = ['prayer', 'medical'];

export const REVIEW_LIMITS = {
  bodyMax: 500,
  nameMin: 2,
  nameMax: 40,
  /** guest display names (public.profiles) */
  guestNameMax: 20,
  reasonMax: 200,
  /** a food rating pill only appears from this many ratings */
  foodMinCount: 3,
  /** summaries and lists are re-fetched after this long */
  cacheMs: 5 * 60_000,
} as const;

export const REVIEW_POLICY =
  'Reviews are about places and food only. Do not name or describe people, and leave out links, emails and phone numbers. We store your user id, the display name you choose and what you write, nothing else. You can delete all of it at any time. Averages include guest reviews and ratings; "NUST" marks a verified university email.';

export interface Review {
  id: string;
  placeId: string;
  displayName: string;
  rating: number;
  body: string;
  createdAt: string;
  /** written by the signed-in user */
  mine: boolean;
  /** from the database (auth.users), never from the client: verified university account, guest, or unknown */
  author: 'nust' | 'guest' | null;
}

export interface Summary {
  avg: number;
  count: number;
  /** how many of `count` came from guests */
  guestCount: number;
}

/** Averages count guests too, and always say so when any are included. '' when none are. */
export function guestNote(guestCount: number, noun: 'review' | 'rating') {
  if (!guestCount) return '';
  return `Includes ${guestCount} guest ${noun}${guestCount === 1 ? '' : 's'} (not verified)`;
}

export interface ReviewUser {
  id: string;
  /** '' for guests */
  email: string;
  /** anonymous (guest) account */
  guest: boolean;
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
  /**
   * Send a magic link; resolves when the email is on its way. For a guest this links the email to the same
   * account instead (an upgrade: their reviews keep going and get the NUST label once the email is confirmed).
   * `captchaToken`: Turnstile token, required by Supabase once captcha protection is on.
   */
  signIn(email: string, captchaToken?: string): Promise<void>;
  /** Create an anonymous (guest) account and give it a display name. Already a guest: just sets the name. */
  signInAsGuest(displayName: string, captchaToken?: string): Promise<void>;
  /** The guest's display name (public.profiles), or null. */
  guestName(): Promise<string | null>;
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
