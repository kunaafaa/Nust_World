import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCKED_TERMS } from '@/lib/reviews/blockedTerms';
import { guestNameViolation, textViolation } from '@/lib/reviews/textCheck';
import { isAllowedEmail, parseDomains } from '@/lib/reviews/config';

const root = path.resolve(__dirname, '..');
const cases = (
  JSON.parse(readFileSync(path.join(root, 'supabase/tests/text-cases.json'), 'utf8')) as {
    cases: [string, string | null][];
  }
).cases;
const guestCases = (
  JSON.parse(readFileSync(path.join(root, 'supabase/tests/guest-name-cases.json'), 'utf8')) as {
    cases: [string, string | null][];
  }
).cases;

describe('review text check (client copy)', () => {
  it.each(cases)('%j -> %s', (text, want) => {
    expect(textViolation(text)).toBe(want);
  });

  it('blocked terms match the SQL seed exactly', () => {
    const seed = readFileSync(path.join(root, 'supabase/seed/blocked_terms.sql'), 'utf8');
    const fromSql = [...seed.matchAll(/^\s*\('([a-z ]+)'\)/gm)].map((m) => m[1]);
    expect(fromSql).toEqual([...BLOCKED_TERMS]);
    expect(new Set(BLOCKED_TERMS).size).toBe(BLOCKED_TERMS.length);
    for (const t of BLOCKED_TERMS) expect(t).toMatch(/^[a-z]+( [a-z]+)*$/);
  });

  it('every blocked term is caught on its own', () => {
    for (const t of BLOCKED_TERMS) expect(textViolation(`well ${t} then`)).toBe('blocked');
  });
});

describe('guest name check (client copy)', () => {
  it.each(guestCases)('%j -> %s', (name, want) => {
    expect(guestNameViolation(name)).toBe(want);
  });
});

describe('allowed email domains', () => {
  it('parses the env list leniently', () => {
    expect(parseDomains(' NUST.edu.pk, @seecs.edu.pk ,,bad, x ')).toEqual([
      'nust.edu.pk',
      'seecs.edu.pk',
    ]);
    expect(parseDomains(undefined)).toEqual([]);
  });
  it('accepts only exact listed domains', () => {
    const d = ['seecs.edu.pk'];
    expect(isAllowedEmail('Ali@SEECS.edu.pk', d)).toBe(true);
    expect(isAllowedEmail('ali@student.seecs.edu.pk', d)).toBe(false);
    expect(isAllowedEmail('ali@seecs.edu.pk.evil.com', d)).toBe(false);
    expect(isAllowedEmail('seecs.edu.pk', d)).toBe(false);
    expect(isAllowedEmail('a b@seecs.edu.pk', d)).toBe(false);
  });
});
