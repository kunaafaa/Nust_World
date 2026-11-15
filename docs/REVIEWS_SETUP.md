# Reviews and food ratings: setup

Place cards can show reviews (1 to 5 stars plus optional text) and cafe menus can show food ratings. The feature is
**off by default**: cards say "Reviews coming soon" and no review code or Supabase code is downloaded.

## What it does

- **Place reviews**: one review per person per place; editable and deletable by its author. Not offered for prayer
  and medical places (`REVIEW_EXCLUDED_CATEGORIES`, enforced again in the database through `excluded_places`).
- **Food ratings**: 1 to 5 stars per menu item. A rating pill (`★ 4.7 (3)`) appears only from 3 ratings. A
  "Top rated" chip leads the menu's category chips once any item qualifies.
- **Sign-in**: a magic link sent to a university email address. Only domains in the `allowed_domains` table can
  post (checked by row-level security), mirrored in the app by `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` so people get a
  clear message early.
- **Moderation**: text is normalised, then links, email addresses, phone numbers, hidden characters and blocked
  terms are refused. Limits are 10 writes an hour and 20 reports a day per person. A review is hidden
  automatically after 3 reports from different people.
- **Privacy**: stored are the Supabase user id, the display name the person typed, and their rating and text.
  There is no location and no device data. Reviews are read through views that never expose user ids. "Delete my
  data" removes every review, rating and report the person made.
- **Caching and offline use**: reads are cached for 5 minutes. Public summaries and lists are also kept on the
  device, so cards still show ratings offline, read-only. Writes are refused while offline.
- **Rendering**: review text is plain text only. React escapes it, and nothing uses `innerHTML`.

## Turning it on

You need a Supabase project (the free tier is fine) and access to the Vercel project.

1. **Create the database objects.** In Supabase, open the SQL Editor and run these files in order. All of them are
   safe to run again.
   1. `supabase/migrations/001_reviews.sql`
   2. `supabase/seed/blocked_terms.sql`
   3. `supabase/seed/excluded_places.sql`
2. **Allow the university domains.** Use exact domains; subdomains are not implied.
   ```sql
   insert into public.allowed_domains (domain) values ('nust.edu.pk'), ('seecs.edu.pk')
   on conflict do nothing;
   ```
3. **Set up authentication** (Authentication section):
   - Providers → Email: enabled. Leave "Confirm email" on; the magic link confirms the address.
   - URL Configuration → Site URL: the production URL. Redirect URLs: the production URL and
     `http://localhost:3000/**` for local testing.
   - Email: Supabase's built-in mailer sends only a few emails an hour. For real use, set up custom SMTP under
     Project Settings → Auth → SMTP.
4. **Set the environment variables** (Vercel → Project → Settings → Environment Variables, or `.env.local` when
   working locally; see `.env.example`):
   ```
   NEXT_PUBLIC_REVIEWS_ENABLED=1
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=nust.edu.pk,seecs.edu.pk
   ```
   Use the **anon** key from Project Settings → API. **Never** use the `service_role` key anywhere in this app: it
   bypasses every rule above.
5. **Redeploy.** `NEXT_PUBLIC_*` values are baked in at build time.

## Trying it without Supabase

Add `?reviews=memory` to any URL (for example `/?place=concordia-1-6900&reviews=memory`). The page then uses an
in-memory store that applies the same rules, has a few demo reviews and ratings (named "Demo ..."), and signs in
straight away with any allowed-domain address. Nothing leaves the browser, and everything is gone on reload. The
end-to-end tests (`e2e/reviews.spec.ts`) run this way.

## Tests

- `npx vitest run tests/reviewsDb.test.ts` runs the real migration in pglite (Postgres in WebAssembly) with a stand-in
  for Supabase's `auth` schema (`supabase/tests/auth_stub.sql`, never run on Supabase). It then runs
  `supabase/tests/rls.sql`, which checks:
  - anon access
  - wrong-domain users
  - forced user ids
  - protected columns
  - other users' rows
  - the views
  - reporting and auto-hide
  - both rate limits
  - "delete my data"
- `supabase/tests/text-cases.json` is shared: the same cases run against the SQL `text_violation()` and the client
  copy in `src/lib/reviews/textCheck.ts`, so the two cannot drift apart.
- `tests/reviewText.test.ts` also checks that `src/lib/reviews/blockedTerms.ts` and
  `supabase/seed/blocked_terms.sql` list the same terms.

## Day-to-day

- **New prayer or medical place in the data**: run `npm run reviews-seed`, then run
  `supabase/seed/excluded_places.sql` again. A unit test fails if the committed seed is out of date.
- **Blocked terms**: add the term to both `src/lib/reviews/blockedTerms.ts` and `supabase/seed/blocked_terms.sql`,
  then run the seed again.
- **Limits**: `update public.review_limits set writes_per_hour = 10, reports_per_day = 20, hide_after_reports = 3;`
- **Reported reviews**: `select * from public.reviews where report_count > 0 order by report_count desc;`
  - To restore a review: `update public.reviews set hidden = false where id = '...';` (run this as the project
    owner in the SQL editor).
  - To clear its reports: `delete from public.review_reports where review_id = '...';`
- **Removing a person entirely**: "Delete my data" removes their content. Their sign-in record (email address in
  `auth.users`) can only be removed by the project owner, under Authentication → Users.

## Food item keys

Ratings are attached to a stable key per dish (`<cafeId>/<slug>`), not to the cafe site's own ids, which are list
positions. `npm run menus` keeps `data/menus/item-keys.json`:

- Existing keys never change or get reused.
- New dishes get new keys.
- `npm run menus -- --keys-only` adds keys to the menus already on disk without using the network.

When a cafe renames a dish, edit `item-keys.json` so the new `"<category>|<new name>"` points at the old key, and
the dish keeps its ratings.

## Files

| File                                  | What it is                                                           |
| ------------------------------------- | -------------------------------------------------------------------- |
| `supabase/migrations/001_reviews.sql` | Tables, views, RLS, triggers, text checks, limits, RPC               |
| `supabase/seed/*.sql`                 | Blocked terms; excluded (prayer and medical) places                  |
| `supabase/tests/rls.sql`              | Database checks (run by `tests/reviewsDb.test.ts`)                   |
| `src/lib/reviews/`                    | Types, config, text check, cached client, Supabase and memory stores |
| `src/components/reviews/`             | Reviews section, food rating pill and rater, sign-in                 |
