/**
 * ReviewStore on Supabase, anon key only. Loaded with a dynamic import, so @supabase/supabase-js is fetched only
 * when a card with reviews opens. Every rule lives in the database (supabase/migrations/*.sql);
 * this file just maps its errors to friendly messages.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ALLOWED_EMAIL_DOMAINS, isAllowedEmail, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { VIOLATION_MESSAGE, type TextViolation } from './textCheck';
import { checkDraft, checkFood, checkGuestName, checkPlace, checkReport } from './validate';
import {
  ReviewError,
  type Review,
  type ReviewDraft,
  type ReviewStore,
  type ReviewUser,
  type Summary,
} from './types';

interface PgError {
  code?: string;
  message?: string;
}

/** Database error -> a message that is safe and useful to show. */
export function mapError(e: PgError | null | undefined): ReviewError {
  const msg = e?.message ?? '';
  if (e?.code === 'P0429')
    return new ReviewError('Too many changes in a short time. Try again later.', 'rate');
  const text = /text not allowed: (\w+)/.exec(msg)?.[1] as TextViolation | undefined;
  if (text && text in VIOLATION_MESSAGE) return new ReviewError(VIOLATION_MESSAGE[text], 'text');
  if (/does not take reviews/.test(msg))
    return new ReviewError('This place does not take reviews.', 'excluded');
  if (/own review/.test(msg))
    return new ReviewError('You cannot report your own review.', 'invalid');
  if (e?.code === '42501')
    return new ReviewError(
      'Continue as a guest or sign in with your university email to post.',
      'domain',
    );
  if (e?.code === '23514' || e?.code === '22001')
    return new ReviewError('That does not look right.', 'invalid');
  return new ReviewError('Could not reach reviews right now. Try again later.', 'server');
}

const toUser = (u: User | null | undefined): ReviewUser | null =>
  u ? { id: u.id, email: u.email ?? '', guest: u.is_anonymous === true } : null;

const summary = (r: { avg: unknown; count: unknown; guest_count?: unknown }): Summary => ({
  avg: Number(r.avg),
  count: Number(r.count),
  guestCount: Number(r.guest_count ?? 0),
});

const authError = (e: { message?: string }, what: string) =>
  new ReviewError(
    /captcha/i.test(e.message ?? '')
      ? 'The captcha check failed or expired. Try again.'
      : `Could not ${what}. Try again later.`,
    'auth',
  );

export class SupabaseStore implements ReviewStore {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;

  constructor() {
    this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  async user() {
    const { data } = await this.sb.auth.getSession();
    return toUser(data.session?.user);
  }
  onAuthChange(cb: (u: ReviewUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)));
    return () => data.subscription.unsubscribe();
  }
  async signIn(email: string, captchaToken?: string) {
    if (!isAllowedEmail(email, ALLOWED_EMAIL_DOMAINS))
      throw new ReviewError('Use your university email address.', 'domain');
    const e = email.trim().toLowerCase();
    // come back to the same place card after following the link
    const back = new URL(location.href);
    back.hash = '';
    if ((await this.user())?.guest) {
      // Upgrade: link the email to this guest account, so its reviews and ratings stay with it.
      const { error } = await this.sb.auth.updateUser(
        { email: e },
        { emailRedirectTo: back.toString() },
      );
      if (error?.code === 'email_exists')
        throw new ReviewError(
          'That email already has an account. Sign out of the guest account first to use it (your guest reviews stay as guest reviews; "Delete my data" removes them).',
          'auth',
        );
      if (error) throw authError(error, 'send the confirmation link');
      return;
    }
    const { error } = await this.sb.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: back.toString(), shouldCreateUser: true, captchaToken },
    });
    if (error) throw authError(error, 'send the sign-in link');
  }
  async signInAsGuest(displayName: string, captchaToken?: string) {
    const name = checkGuestName(displayName);
    const me = await this.user();
    if (me && !me.guest) throw new ReviewError('You are already signed in.', 'auth');
    if (!me) {
      const { error } = await this.sb.auth.signInAnonymously({ options: { captchaToken } });
      if (error) throw authError(error, 'start a guest session');
    }
    const { data: own, error: readErr } = await this.sb
      .from('profiles')
      .select('user_id')
      .maybeSingle();
    if (readErr) throw mapError(readErr);
    const { error } = own
      ? await this.sb.from('profiles').update({ display_name: name }).eq('user_id', own.user_id)
      : await this.sb.from('profiles').insert({ display_name: name });
    if (error) throw mapError(error);
  }
  async guestName() {
    if (!(await this.user())?.guest) return null;
    const { data, error } = await this.sb.from('profiles').select('display_name').maybeSingle();
    if (error) throw mapError(error);
    return data ? String(data.display_name) : null;
  }
  async signOut() {
    await this.sb.auth.signOut();
  }

  private async uid(): Promise<string> {
    const u = await this.user();
    if (!u) throw new ReviewError('Sign in first.', 'auth');
    return u.id;
  }

  async placeSummary(placeId: string): Promise<Summary | null> {
    checkPlace(placeId);
    const { data, error } = await this.sb
      .from('place_rating_summary')
      .select('avg,count,guest_count')
      .eq('place_id', placeId)
      .maybeSingle();
    if (error) throw mapError(error);
    return data ? summary(data) : null;
  }
  async placeReviews(placeId: string): Promise<Review[]> {
    checkPlace(placeId);
    const { data, error } = await this.sb
      .from('public_reviews')
      .select('id,place_id,display_name,rating,body,created_at,mine,author')
      .eq('place_id', placeId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw mapError(error);
    return (data ?? []).map((r) => ({
      id: String(r.id),
      placeId: String(r.place_id),
      displayName: String(r.display_name),
      rating: Number(r.rating),
      body: String(r.body ?? ''),
      createdAt: String(r.created_at),
      mine: r.mine === true,
      author: r.author === 'nust' || r.author === 'guest' ? r.author : null,
    }));
  }
  async saveReview(draft: ReviewDraft) {
    const d = checkDraft(draft);
    await this.uid();
    const row = { display_name: d.displayName, rating: d.rating, body: d.body };
    const { data: own } = await this.sb
      .from('reviews')
      .select('id')
      .eq('place_id', d.placeId)
      .maybeSingle();
    const { error } = own
      ? await this.sb.from('reviews').update(row).eq('id', own.id)
      : await this.sb.from('reviews').insert({ ...row, place_id: d.placeId });
    if (error) throw mapError(error);
  }
  async deleteReview(id: string) {
    await this.uid();
    const { error } = await this.sb.from('reviews').delete().eq('id', id);
    if (error) throw mapError(error);
  }
  async reportReview(id: string, why: string) {
    const reason = checkReport(id, why);
    await this.uid();
    const { error } = await this.sb.from('review_reports').insert({ review_id: id, reason });
    if (error && error.code !== '23505') throw mapError(error); // 23505: already reported, fine
  }

  async foodSummaries(cafeId: string) {
    const { data, error } = await this.sb
      .from('food_rating_summary')
      .select('item_key,avg,count,guest_count')
      .eq('cafe_id', cafeId);
    if (error) throw mapError(error);
    const out: Record<string, Summary> = {};
    for (const r of data ?? []) out[String(r.item_key)] = summary(r);
    return out;
  }
  async myFoodRatings(cafeId: string) {
    const out: Record<string, number> = {};
    if (!(await this.user())) return out;
    const { data, error } = await this.sb
      .from('food_ratings')
      .select('item_key,rating')
      .eq('cafe_id', cafeId);
    if (error) throw mapError(error);
    for (const r of data ?? []) out[String(r.item_key)] = Number(r.rating);
    return out;
  }
  async rateFood(cafeId: string, itemKey: string, rating: number) {
    checkFood(cafeId, itemKey, rating);
    await this.uid();
    const { data: own } = await this.sb
      .from('food_ratings')
      .select('item_key')
      .eq('item_key', itemKey)
      .maybeSingle();
    const { error } = own
      ? await this.sb.from('food_ratings').update({ rating }).eq('item_key', itemKey)
      : await this.sb.from('food_ratings').insert({ item_key: itemKey, cafe_id: cafeId, rating });
    if (error) throw mapError(error);
  }

  async deleteMyData() {
    await this.uid();
    const { error } = await this.sb.rpc('delete_my_data');
    if (error) throw mapError(error);
  }
}
