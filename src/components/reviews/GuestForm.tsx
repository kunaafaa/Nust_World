'use client';
/**
 * "Continue as guest": a display name (2 to 20 characters, same text rules as reviews, nothing that looks official)
 * and, on the real backend, a Turnstile captcha. Creates a Supabase anonymous user and saves the name to its
 * profile. A guest who has no name yet (e.g. after "Delete my data") only sees the name field.
 */
import { useEffect, useState } from 'react';
import { getStore, isOffline } from '@/lib/reviews/client';
import { guestNameViolation, VIOLATION_MESSAGE } from '@/lib/reviews/textCheck';
import { REVIEW_LIMITS, ReviewError } from '@/lib/reviews/types';
import { setGuestName, useReviewAuth } from '@/lib/reviews/useReviewAuth';
import { captchaNeeded, Turnstile } from './Turnstile';

export function GuestForm({ compact = false }: { compact?: boolean }) {
  const user = useReviewAuth((s) => s.user);
  const [kind, setKind] = useState<'supabase' | 'memory' | null>(null);
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void getStore().then((s) => live && setKind(s?.kind ?? null));
    return () => {
      live = false;
    };
  }, []);

  // the captcha guards creating the anonymous account; an existing guest only names itself
  const captcha = captchaNeeded(kind) && !user;
  const live = name.trim() ? guestNameViolation(name) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = name.trim();
    if (isOffline()) return setError('You are offline. Try again when you reconnect.');
    if (n.length < REVIEW_LIMITS.nameMin || n.length > REVIEW_LIMITS.guestNameMax)
      return setError(
        `Pick a name of ${REVIEW_LIMITS.nameMin} to ${REVIEW_LIMITS.guestNameMax} characters.`,
      );
    if (live) return setError(VIOLATION_MESSAGE[live]);
    if (captcha && !token) return setError('Please complete the captcha first.');
    setBusy(true);
    try {
      const s = await getStore();
      if (!s) throw new ReviewError('Reviews are not available.');
      await s.signInAsGuest(n, token ?? undefined);
      setGuestName(n, await s.user());
    } catch (err) {
      setError(err instanceof ReviewError ? err.message : 'Could not continue as a guest.');
      if (captcha) {
        setToken(null);
        setResetKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={compact ? 'rv-guest rv-guest-compact' : 'rv-guest'}
      onSubmit={submit}
      aria-label="Continue as guest"
      data-reviews-guest
    >
      {!compact && (
        <p className="rv-note">
          {user ? 'Pick a display name to post as a guest.' : 'No account needed:'}
        </p>
      )}
      <div className="rv-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={REVIEW_LIMITS.guestNameMax}
          placeholder="Display name"
          aria-label="Guest display name"
          className="rv-input"
          autoComplete="nickname"
          data-nodrag
        />
        <button type="submit" className="rv-btn rv-btn-main" disabled={busy}>
          {busy ? 'Starting…' : 'Continue as guest'}
        </button>
      </div>
      {captcha && <Turnstile action="guest" onToken={setToken} resetKey={resetKey} />}
      <p className="rv-fine">
        Guest reviews show a “Guest” label. Your name is shown, nothing else.
      </p>
      {(error || live) && (
        <p className="rv-error" role="alert">
          {error || VIOLATION_MESSAGE[live!]}
        </p>
      )}
    </form>
  );
}
