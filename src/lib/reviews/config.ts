/**
 * Review settings from build-time environment variables (see .env.example and docs/REVIEWS_SETUP.md).
 * Each process.env.NEXT_PUBLIC_* is written out in full so Next can inline it into the client bundle.
 * Only the anon key is ever used: the service-role key must never be set in this app.
 */
import { parseUrlParams } from '@/lib/urlParams';

const flag = (v: string | undefined) => v === '1' || v === 'true';

export const REVIEWS_ENABLED = flag(process.env.NEXT_PUBLIC_REVIEWS_ENABLED);
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Lower-case email domains allowed to post. Must match the allowed_domains table (the database decides). */
export function parseDomains(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
}
export const ALLOWED_EMAIL_DOMAINS = parseDomains(process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS);

/** Domains the in-memory demo store accepts when none are configured. */
export const DEMO_DOMAINS = ['nust.edu.pk', 'seecs.edu.pk'];

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0
    ? ''
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

export function isAllowedEmail(email: string, domains: readonly string[]): boolean {
  const e = email.trim().toLowerCase();
  if (e.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;
  return domains.includes(emailDomain(e));
}

/**
 * Which backend the card uses:
 * - 'memory': `?reviews=memory` in the URL (tests and demos; nothing leaves the browser). A developer tool: only
 *   while NEXT_PUBLIC_DEV_TOOLS is on.
 * - 'supabase': reviews switched on and both Supabase variables set
 * - 'off': show "Reviews coming soon"
 */
export function reviewsMode(search: string): 'memory' | 'supabase' | 'off' {
  if (parseUrlParams(search).reviewsMemory) return 'memory';
  if (REVIEWS_ENABLED && SUPABASE_URL && SUPABASE_ANON_KEY) return 'supabase';
  return 'off';
}
