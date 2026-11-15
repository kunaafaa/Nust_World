/**
 * HTTP security headers. The static ones are set for every path in next.config.ts; the Content-Security-Policy
 * needs a fresh nonce per page view, so src/proxy.ts sets it on HTML documents (see docs/SECURITY_REVIEW.md).
 */

/** The origin of a configured https URL (e.g. the Supabase project), or null if it is missing or not https. */
export function httpsOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export interface CspOptions {
  nonce: string;
  /** `next dev` needs 'unsafe-eval' (React rebuilds server error stacks with eval). Never in production. */
  dev: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL, allowed in connect-src when it is a valid https URL */
  supabaseUrl?: string;
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY is set: allow the Cloudflare Turnstile captcha (its script and iframe) */
  turnstile?: boolean;
}

/** Cloudflare Turnstile serves its script and its challenge iframe from here. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * The page's policy.
 * - script-src: only scripts carrying this request's nonce, plus what they load ('strict-dynamic'): the Next.js
 *   chunks and the Vercel Analytics script (same origin, /_vercel/insights/script.js).
 * - style-src 'unsafe-inline' is required: React renders style="" attributes (sheet heights, label positions) and
 *   framer-motion animates inline styles. A nonce cannot cover style attributes.
 * - worker-src blob: covers the routing worker in dev; production loads it from /_next/static.
 * - Turnstile (only when configured): its script is added by our own nonce'd code, so 'strict-dynamic' allows it
 *   (the host entry is for browsers without 'strict-dynamic'); its challenge runs in an iframe (frame-src).
 */
export function contentSecurityPolicy({
  nonce,
  dev,
  supabaseUrl,
  turnstile = false,
}: CspOptions): string {
  const supabase = httpsOrigin(supabaseUrl);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(turnstile ? [TURNSTILE_ORIGIN] : []),
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // without Turnstile, frames fall back to default-src 'self' as before
    ...(turnstile ? { 'frame-src': ["'self'", TURNSTILE_ORIGIN] } : {}),
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(supabase ? [supabase] : []), ...(dev ? ['ws:'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!dev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** Headers for every response (next.config.ts). */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];
