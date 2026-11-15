/**
 * Runs the real migration in pglite (Postgres compiled to WASM) with a stand-in for Supabase's auth schema,
 * then supabase/tests/rls.sql, which raises "FAIL: ..." on the first broken rule.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { excludedPlaceIds, excludedPlacesSql } from '../scripts/lib/appPlaces';

const root = path.resolve(__dirname, '..');
const sql = (p: string) => readFileSync(path.join(root, p), 'utf8');
const cases = (
  JSON.parse(sql('supabase/tests/text-cases.json')) as { cases: [string, string | null][] }
).cases;

const migrations = [
  'supabase/migrations/001_reviews.sql',
  'supabase/migrations/002_advisor_fixes.sql',
  'supabase/migrations/003_guest_reviews.sql',
  'supabase/migrations/004_views_without_auth_users.sql',
];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql('supabase/tests/auth_stub.sql'));
  for (const m of migrations) await db.exec(sql(m));
  await db.exec(sql('supabase/seed/blocked_terms.sql'));
}, 60_000);

describe('supabase migration (pglite)', () => {
  // 001 only re-runs on a database without 003 (its views have fewer columns, and Postgres cannot drop view
  // columns). Every later migration re-runs on top of the full set.
  it('is safe to run again', async () => {
    for (const m of migrations.slice(1)) await db.exec(sql(m));
  });

  it('keeps email_allowed() out of the API schema', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where p.proname = 'email_allowed' and s.nspname = 'public'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  // Supabase advisor "Exposed Auth Users": no API-exposed view may read auth.users (004).
  it('no public view reads auth.users directly', async () => {
    const r = await db.query<{ view: string }>(
      `select distinct v.relname as view
         from pg_depend d
         join pg_rewrite rw on rw.oid = d.objid
         join pg_class v on v.oid = rw.ev_class
         join pg_namespace n on n.oid = v.relnamespace
        where d.refobjid = 'auth.users'::regclass and n.nspname = 'public'`,
    );
    expect(r.rows).toEqual([]);
  });

  it('text_violation() agrees with the shared cases', async () => {
    for (const [text, want] of cases) {
      const r = await db.query<{ v: string | null }>('select public.text_violation($1) as v', [
        text,
      ]);
      expect([text, r.rows[0].v]).toEqual([text, want]);
    }
  });

  it('private.name_violation() agrees with the shared guest name cases', async () => {
    const guest = (
      JSON.parse(sql('supabase/tests/guest-name-cases.json')) as {
        cases: [string, string | null][];
      }
    ).cases;
    for (const [name, want] of guest) {
      const r = await db.query<{ v: string | null }>('select private.name_violation($1) as v', [
        name,
      ]);
      expect([name, r.rows[0].v]).toEqual([name, want]);
    }
  });

  it('passes every RLS / trigger check in rls.sql', async () => {
    await db.exec(sql('supabase/tests/rls.sql'));
  });

  it('excluded_places seed is current and blocks reviews', async () => {
    const seed = sql('supabase/seed/excluded_places.sql');
    expect(seed).toBe(excludedPlacesSql(excludedPlaceIds())); // else: npm run reviews-seed
    await db.exec(seed);
    await db.exec(
      `select t.as_user('00000000-0000-0000-0000-0000000000f1', 'f@seecs.edu.pk'); set role authenticated;`,
    );
    const err = await db
      .query(
        `insert into public.reviews (place_id, display_name, rating) values ('masjid-5311', 'Student F', 5)`,
      )
      .then(() => '')
      .catch((e: Error) => e.message);
    await db.exec('reset role;');
    expect(err).toMatch(/does not take reviews/);
  });
});
