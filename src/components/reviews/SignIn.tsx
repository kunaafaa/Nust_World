'use client';
import { useEffect, useState } from 'react';
import { getStore, isOffline } from '@/lib/reviews/client';
import { ReviewError } from '@/lib/reviews/types';
import { useReviewAuth } from '@/lib/reviews/useReviewAuth';
import { captchaNeeded, Turnstile } from './Turnstile';

/**
 * Magic-link sign in: university email only (the database checks the domain again). For a guest this is the
 * upgrade: the email is linked to the same account, and once confirmed their reviews show the NUST badge.
 */
export function SignIn({ prompt }: { prompt: string }) {
  const guest = useReviewAuth((s) => !!s.user?.guest);
  const [kind, setKind] = useState<'supabase' | 'memory' | null>(null);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void getStore().then((s) => live && setKind(s?.kind ?? null));
    return () => {
      live = false;
    };
  }, []);

  // linking an email to a guest account needs no captcha (the guest already passed one)
  const captcha = captchaNeeded(kind) && !guest;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isOffline()) return setError('You are offline. Sign in when you reconnect.');
    if (captcha && !token) return setError('Please complete the captcha first.');
    setState('sending');
    try {
      const s = await getStore();
      if (!s) throw new ReviewError('Reviews are not available.');
      await s.signIn(email, token ?? undefined);
      setState(s.kind === 'memory' ? 'idle' : 'sent');
    } catch (err) {
      setState('idle');
      setError(
        err instanceof ReviewError ? err.message : 'Could not send the link. Try again later.',
      );
      if (captcha) {
        setToken(null);
        setResetKey((k) => k + 1);
      }
    }
  };

  if (state === 'sent')
    return (
      <p className="rv-note" role="status">
        {guest
          ? `Check your inbox: open the link we sent to ${email.trim()} to confirm it. Your reviews then show the NUST badge.`
          : `Check your inbox: we sent a sign-in link to ${email.trim()}. Open it on this device.`}
      </p>
    );
  return (
    <form className="rv-signin" onSubmit={send} data-reviews-signin>
      <p className="rv-note">{prompt}</p>
      <div className="rv-row">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={120}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@seecs.edu.pk"
          aria-label="University email"
          className="rv-input"
          data-nodrag
        />
        <button type="submit" className="rv-btn rv-btn-main" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      </div>
      {captcha && <Turnstile action="signin" onToken={setToken} resetKey={resetKey} />}
      {error && (
        <p className="rv-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
