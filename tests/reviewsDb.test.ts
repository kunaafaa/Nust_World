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

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql('supabase/tests/auth_stub.sql'));
  await db.exec(sql('supabase/migrations/001_reviews.sql'));
  await db.exec(sql('supabase/seed/blocked_terms.sql'));
}, 60_000);

describe('supabase migration (pglite)', () => {
  it('is safe to run twice', async () => {
    await db.exec(sql('supabase/migrations/001_reviews.sql'));
  });

  it('text_violation() agrees with the shared cases', async () => {
    for (const [text, want] of cases) {
      const r = await db.query<{ v: string | null }>('select public.text_violation($1) as v', [
        text,
      ]);
      expect([text, r.rows[0].v]).toEqual([text, want]);
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
