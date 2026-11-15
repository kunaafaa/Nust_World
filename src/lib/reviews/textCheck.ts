/**
 * Client copy of public.text_violation() in supabase/migrations/001_reviews.sql, so people see why their text is
 * refused before sending it. The database check is the one that counts; keep the two identical (shared cases in
 * supabase/tests/text-cases.json run against both in tests/reviewText.test.ts).
 */
import { BLOCKED_TERMS } from './blockedTerms';

export type TextViolation = 'control' | 'email' | 'link' | 'phone' | 'blocked';

const CONTROL = /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏⁠﻿]/;
const EMAIL = /([a-z0-9._%+-]@|@[a-z0-9-]+\.|\(at\)|\[at\])/;
const LINK =
  /(https?:|www\.|\.(com|net|org|pk|io|co|me|ly|app|dev|xyz|info|link|site|online|gg)([^a-z]|$)|(^|[^a-z])dot\s*(com|net|org|pk)([^a-z]|$))/;
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
};
const collapse = (s: string) => s.replace(/([a-z])\1+/g, '$1');
const TERMS = BLOCKED_TERMS.map(collapse);

export function textViolation(t: string | null | undefined): TextViolation | null {
  if (!t) return null;
  const s = t.normalize('NFKC').toLowerCase();
  if (CONTROL.test(s)) return 'control';
  if (EMAIL.test(s)) return 'email';
  if (LINK.test(s)) return 'link';
  if (/[0-9]{7,}/.test(s.replace(/[\s().-]/g, ''))) return 'phone';
  let w = s.replace(/[0134578@$!]/g, (c) => LEET[c]);
  w = collapse(w.replace(/[^a-z]+/g, ' '));
  w = ` ${w.trim()} `;
  const j = w.replace(/ /g, '');
  for (const term of TERMS)
    if (w.includes(` ${term} `) || (term.length >= 5 && j.includes(term))) return 'blocked';
  return null;
}

/** Guest names must not pass as official (client copy of private.name_violation() in 003_guest_reviews.sql). */
const RESERVED = / (nust[a-z]*|admins?|administrators?|moderators?|officials?|verified|staff) /;

export function guestNameViolation(
  t: string | null | undefined,
): TextViolation | 'reserved' | null {
  const v = textViolation(t);
  if (v) return v;
  const w = (t ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c]);
  return RESERVED.test(` ${w.replace(/[^a-z]+/g, ' ').trim()} `) ? 'reserved' : null;
}

export const VIOLATION_MESSAGE: Record<TextViolation | 'reserved', string> = {
  control: 'Please remove the hidden or control characters.',
  email: 'Please leave out email addresses.',
  link: 'Please leave out links and web addresses.',
  phone: 'Please leave out phone numbers.',
  blocked: 'Please keep it friendly: that wording is not allowed.',
  reserved:
    'Guest names cannot look official (NUST, admin, moderator…). Verify your NUST email for a badge.',
};
