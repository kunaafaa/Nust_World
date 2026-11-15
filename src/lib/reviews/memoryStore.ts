/**
 * In-memory ReviewStore: same rules as the database (text checks, rate limits, hide after reports, excluded
 * places), nothing leaves the page. Used by tests and by `?reviews=memory`.
 */
import { isAllowedEmail } from './config';
import { textViolation, VIOLATION_MESSAGE } from './textCheck';
import { checkGuestName } from './validate';
import {
  REVIEW_LIMITS,
  ReviewError,
  type Review,
  type ReviewDraft,
  type ReviewStore,
  type ReviewUser,
  type Summary,
} from './types';

interface Row {
  id: string;
  placeId: string;
  userId: string;
  displayName: string;
  rating: number;
  body: string;
  createdAt: string;
  hidden: boolean;
  reports: Set<string>;
  /** how many of `reports` came from guests */
  reportsByGuests: number;
}

export interface MemorySeed {
  reviews?: {
    placeId: string;
    userId: string;
    displayName: string;
    rating: number;
    body: string;
  }[];
  food?: { cafeId: string; itemKey: string; userId: string; rating: number }[];
  /** seed user ids that are guests (everyone else counts as a verified university account) */
  guests?: string[];
}

export interface MemoryLimits {
  writesPerHour: number;
  reportsPerDay: number;
  hideAfter: number;
  guestWritesPerHour: number;
  guestReportsPerDay: number;
  /** a guest report counts this much toward hideAfter */
  guestReportWeight: number;
}

export interface MemoryOptions {
  domains: readonly string[];
  seed?: MemorySeed;
  excludedPlaces?: Iterable<string>;
  limits?: Partial<MemoryLimits>;
  now?: () => number;
}

/** Same defaults as public.review_limits. */
export const DEFAULT_LIMITS: MemoryLimits = {
  writesPerHour: 10,
  reportsPerDay: 20,
  hideAfter: 3,
  guestWritesPerHour: 5,
  guestReportsPerDay: 3,
  guestReportWeight: 0.5,
};

const checkText = (t: string) => {
  const v = textViolation(t);
  if (v) throw new ReviewError(VIOLATION_MESSAGE[v], 'text');
};

export class MemoryStore implements ReviewStore {
  readonly kind = 'memory' as const;
  private me: ReviewUser | null = null;
  private listeners = new Set<(u: ReviewUser | null) => void>();
  private rows: Row[] = [];
  private food = new Map<
    string,
    { cafeId: string; itemKey: string; userId: string; rating: number }
  >();
  private log: { userId: string; kind: 'write' | 'report'; at: number }[] = [];
  private seq = 0;
  private excluded: Set<string>;
  private limits: MemoryLimits;
  private now: () => number;
  /** user ids that are (still) guests; like auth.users.is_anonymous */
  private guests: Set<string>;
  /** guest display names; like public.profiles */
  private profiles = new Map<string, string>();

  constructor(private opts: MemoryOptions) {
    this.excluded = new Set(opts.excludedPlaces ?? []);
    this.limits = { ...DEFAULT_LIMITS, ...opts.limits };
    this.now = opts.now ?? Date.now;
    this.guests = new Set(opts.seed?.guests ?? []);
    for (const r of opts.seed?.reviews ?? [])
      this.rows.push({
        ...r,
        id: `m${++this.seq}`,
        createdAt: new Date(this.now() - this.seq * 86_400_000).toISOString(),
        hidden: false,
        reports: new Set(),
        reportsByGuests: 0,
      });
    for (const f of opts.seed?.food ?? []) this.food.set(`${f.itemKey}|${f.userId}`, f);
  }

  async user() {
    return this.me;
  }
  onAuthChange(cb: (u: ReviewUser | null) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  private emit() {
    for (const cb of this.listeners) cb(this.me);
  }
  /**
   * The demo has no inbox: the "link" is followed at once. A guest is upgraded in place (same id), like
   * Supabase linking an email to an anonymous user.
   */
  async signIn(email: string) {
    if (!isAllowedEmail(email, this.opts.domains))
      throw new ReviewError('Use your university email address.', 'domain');
    const e = email.trim().toLowerCase();
    if (this.me?.guest) {
      this.guests.delete(this.me.id);
      this.me = { id: this.me.id, email: e, guest: false };
    } else this.me = { id: `user:${e}`, email: e, guest: false };
    this.emit();
  }
  /** No captcha in the demo. */
  async signInAsGuest(displayName: string) {
    const name = checkGuestName(displayName);
    if (this.me && !this.me.guest) throw new ReviewError('You are already signed in.', 'auth');
    if (!this.me) {
      const id = `guest:${++this.seq}`;
      this.guests.add(id);
      this.me = { id, email: '', guest: true };
    }
    this.rate('write'); // the profile write, as in the database
    this.profiles.set(this.me.id, name);
    this.emit();
  }
  async guestName() {
    return this.me?.guest ? (this.profiles.get(this.me.id) ?? null) : null;
  }
  async signOut() {
    this.me = null;
    this.emit();
  }

  private isGuest(userId: string) {
    return this.guests.has(userId);
  }
  private requireUser(): ReviewUser {
    if (!this.me) throw new ReviewError('Sign in first.', 'auth');
    if (this.me.guest && !this.profiles.has(this.me.id))
      throw new ReviewError(
        'Continue as a guest or sign in with your university email to post.',
        'domain',
      );
    return this.me;
  }
  private rate(kind: 'write' | 'report') {
    const u = this.me!;
    const t = this.now();
    const win = kind === 'write' ? 3_600_000 : 86_400_000;
    const g = u.guest;
    const lim =
      kind === 'write'
        ? g
          ? this.limits.guestWritesPerHour
          : this.limits.writesPerHour
        : g
          ? this.limits.guestReportsPerDay
          : this.limits.reportsPerDay;
    const n = this.log.filter((l) => l.userId === u.id && l.kind === kind && l.at > t - win).length;
    if (n >= lim)
      throw new ReviewError('Too many changes in a short time. Try again later.', 'rate');
    this.log.push({ userId: u.id, kind, at: t });
  }

  async placeSummary(placeId: string): Promise<Summary | null> {
    const rs = this.rows.filter((r) => r.placeId === placeId && !r.hidden);
    if (!rs.length) return null;
    const avg = rs.reduce((s, r) => s + r.rating, 0) / rs.length;
    return {
      avg: Math.round(avg * 100) / 100,
      count: rs.length,
      guestCount: rs.filter((r) => this.isGuest(r.userId)).length,
    };
  }
  async placeReviews(placeId: string): Promise<Review[]> {
    return this.rows
      .filter((r) => r.placeId === placeId && !r.hidden)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        placeId: r.placeId,
        displayName: r.displayName,
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt,
        mine: r.userId === this.me?.id,
        author: this.isGuest(r.userId) ? ('guest' as const) : ('nust' as const),
      }));
  }
  async saveReview(d: ReviewDraft) {
    const u = this.requireUser();
    if (this.excluded.has(d.placeId))
      throw new ReviewError('This place does not take reviews.', 'excluded');
    // a guest's review always carries their profile name
    const name = (u.guest ? this.profiles.get(u.id)! : d.displayName).trim();
    const body = d.body.trim();
    if (name.length < REVIEW_LIMITS.nameMin || name.length > REVIEW_LIMITS.nameMax)
      throw new ReviewError('Display name: 2 to 40 characters.', 'invalid');
    if (body.length > REVIEW_LIMITS.bodyMax)
      throw new ReviewError('Review: up to 500 characters.', 'invalid');
    if (!Number.isInteger(d.rating) || d.rating < 1 || d.rating > 5)
      throw new ReviewError('Pick 1 to 5 stars.', 'invalid');
    checkText(name);
    checkText(body);
    this.rate('write');
    const old = this.rows.find((r) => r.placeId === d.placeId && r.userId === u.id);
    if (old) Object.assign(old, { displayName: name, rating: d.rating, body });
    else
      this.rows.push({
        id: `m${++this.seq}`,
        placeId: d.placeId,
        userId: u.id,
        displayName: name,
        rating: d.rating,
        body,
        createdAt: new Date(this.now()).toISOString(),
        hidden: false,
        reports: new Set(),
        reportsByGuests: 0,
      });
  }
  async deleteReview(id: string) {
    const u = this.requireUser();
    this.rows = this.rows.filter((r) => !(r.id === id && r.userId === u.id));
  }
  async reportReview(id: string, reason: string) {
    const u = this.requireUser();
    const r = this.rows.find((x) => x.id === id);
    if (!r) return;
    if (r.userId === u.id) throw new ReviewError('You cannot report your own review.', 'invalid');
    if (reason.length > REVIEW_LIMITS.reasonMax)
      throw new ReviewError('Reason: up to 200 characters.', 'invalid');
    checkText(reason);
    if (r.reports.has(u.id)) return;
    this.rate('report');
    r.reports.add(u.id);
    r.reportsByGuests += u.guest ? 1 : 0;
    const score =
      r.reports.size - r.reportsByGuests + r.reportsByGuests * this.limits.guestReportWeight;
    if (score >= this.limits.hideAfter) r.hidden = true;
  }

  private summaries(cafeId: string) {
    const acc = new Map<string, { s: number; n: number; g: number }>();
    for (const f of this.food.values()) {
      if (f.cafeId !== cafeId) continue;
      const a = acc.get(f.itemKey) ?? { s: 0, n: 0, g: 0 };
      a.s += f.rating;
      a.n += 1;
      a.g += this.isGuest(f.userId) ? 1 : 0;
      acc.set(f.itemKey, a);
    }
    return acc;
  }
  async foodSummaries(cafeId: string) {
    const out: Record<string, Summary> = {};
    for (const [k, a] of this.summaries(cafeId))
      out[k] = { avg: Math.round((a.s / a.n) * 100) / 100, count: a.n, guestCount: a.g };
    return out;
  }
  async myFoodRatings(cafeId: string) {
    const out: Record<string, number> = {};
    if (!this.me) return out;
    for (const f of this.food.values())
      if (f.cafeId === cafeId && f.userId === this.me.id) out[f.itemKey] = f.rating;
    return out;
  }
  async rateFood(cafeId: string, itemKey: string, rating: number) {
    const u = this.requireUser();
    if (!itemKey.startsWith(`${cafeId}/`)) throw new ReviewError('Unknown item.', 'invalid');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new ReviewError('Pick 1 to 5 stars.', 'invalid');
    this.rate('write');
    this.food.set(`${itemKey}|${u.id}`, { cafeId, itemKey, userId: u.id, rating });
  }

  async deleteMyData() {
    const u = this.requireUser();
    this.rows = this.rows.filter((r) => r.userId !== u.id);
    for (const r of this.rows) r.reports.delete(u.id);
    for (const [k, f] of this.food) if (f.userId === u.id) this.food.delete(k);
    this.profiles.delete(u.id);
    this.log = this.log.filter((l) => l.userId !== u.id);
  }
}
