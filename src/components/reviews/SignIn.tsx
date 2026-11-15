'use client';
import { useState } from 'react';
import { getStore, isOffline } from '@/lib/reviews/client';
import { ReviewError } from '@/lib/reviews/types';

/** Magic-link sign in: university email only (the database checks the domain again). */
export function SignIn({ prompt }: { prompt: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isOffline()) return setError('You are offline. Sign in when you reconnect.');
    setState('sending');
    try {
      const s = await getStore();
      if (!s) throw new ReviewError('Reviews are not available.');
      await s.signIn(email);
      setState(s.kind === 'memory' ? 'idle' : 'sent');
    } catch (err) {
      setState('idle');
      setError(
        err instanceof ReviewError ? err.message : 'Could not send the link. Try again later.',
      );
    }
  };

  if (state === 'sent')
    return (
      <p className="rv-note" role="status">
        Check your inbox: we sent a sign-in link to {email.trim()}. Open it on this device.
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
      {error && (
        <p className="rv-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
