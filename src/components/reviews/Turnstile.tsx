'use client';
/**
 * Cloudflare Turnstile captcha (explicit rendering). The token goes to Supabase Auth with the sign-in request, and
 * Supabase checks it with the secret key kept in its Auth settings. The script is only fetched when a sign-in form
 * that needs it is shown; the CSP allows it (script-src via 'strict-dynamic', frame-src for its iframe).
 */
import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '@/lib/reviews/config';
import { TURNSTILE_ORIGIN } from '@/lib/security/headers';
import { useApp } from '@/store/useApp';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'));
    s.onerror = () => {
      loading = null; // try again next time
      s.remove();
      reject(new Error('turnstile failed to load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** A captcha is shown only with the real backend and a configured site key (the demo store has none). */
export const captchaNeeded = (storeKind: 'supabase' | 'memory' | null | undefined) =>
  storeKind === 'supabase' && !!TURNSTILE_SITE_KEY;

/**
 * The widget. `onToken(null)` when the token expires or the check fails. Bump `resetKey` after a failed submit:
 * tokens are single-use.
 */
export function Turnstile({
  action,
  onToken,
  resetKey = 0,
}: {
  action: 'guest' | 'signin';
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  const night = useApp((s) => s.night);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let live = true;
    loadTurnstile()
      .then((ts) => {
        if (!live || !box.current) return;
        widget.current = ts.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: night ? 'dark' : 'light',
          size: 'flexible',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [action, night]);

  useEffect(() => {
    if (!resetKey || !widget.current) return;
    window.turnstile?.reset(widget.current);
    cb.current(null);
  }, [resetKey]);

  return (
    <div className="rv-captcha" data-nodrag>
      <div ref={box} />
      {failed && (
        <p className="rv-error" role="alert">
          Could not load the captcha. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
