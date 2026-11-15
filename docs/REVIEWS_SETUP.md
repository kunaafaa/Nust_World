# Reviews and food ratings: setup

Place cards can show reviews (1 to 5 stars plus optional text) and cafe menus can show food ratings. The feature is
**off by default**: cards say "Reviews coming soon" and no review code or Supabase code is downloaded.

## What it does

- **Place reviews**: one review per person per place; editable and deletable by its author. Not offered for prayer
  and medical places (`REVIEW_EXCLUDED_CATEGORIES`, enforced again in the database through `excluded_places`).
- **Food ratings**: 1 to 5 stars per menu item. A rating pill (`★ 4.7 (3)`) appears only from 3 ratings. A
  "Top rated" chip leads the menu's category chips once any item qualifies.
- **Guests** (`003_guest_reviews.sql`): "Continue as guest" asks for a display name (2 to 20 characters, the same
  text rules, and nothing that looks official such as "NUST …", "admin" or "moderator") and a Cloudflare Turnstile
  captcha, then creates a Supabase **anonymous user** and saves the name in `profiles`. A guest's reviews always
  carry that name and show a **Guest** label.
- **University sign-in** (optional upgrade): a magic link sent to a university email address. Only domains in
  `allowed_domains` count (checked by row-level security, mirrored by `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS`). These
  reviews show a **NUST** badge. A guest who verifies their email keeps the same account: their earlier reviews
  switch to the NUST badge. The badge is worked out in the database from `auth.users` (`is_anonymous`,
  `email_confirmed_at`, email domain); nothing the client sends can set it.
- **Averages** count guests and university accounts alike, and say so: "Includes 2 guest reviews (not verified)"
  under the place summary, "(3, 1 guest)" in food pills.
- **Moderation**: text is normalised, then links, email addresses, phone numbers, hidden characters and blocked
  terms are refused. Limits per person: 10 writes an hour and 20 reports a day; guests 5 writes an hour and 3
  reports a day (`review_limits`). A review is hidden once its reports reach 3, where a guest's report counts as
  half (so 3 university reports, or 6 guest reports): otherwise anyone could hide any review with 3 captchas.
- **Privacy**: stored are the Supabase user id, the display name the person typed, and their rating and text.
  There is no location and no device data. Reviews are read through views that never expose user ids. "Delete my
  data" removes every review, rating, report and guest name the person made. A guest who signs out cannot sign
  back in to that guest account (the app warns first).
- **Caching and offline use**: reads are cached for 5 minutes. Public summaries and lists are also kept on the
  device, so cards still show ratings offline, read-only. Writes are refused while offline.
- **Rendering**: review text is plain text only. React escapes it, and nothing uses `innerHTML`.

## Turning it on

You need a Supabase project (the free tier is fine) and access to the Vercel project.

1. **Create the database objects.** In Supabase, open the SQL Editor and run these files in order. Each migration is
   safe to run again on top of the ones after it, except `001` once `003` is in (Postgres cannot drop the view
   columns `003` added); the seeds are always safe.
   1. `supabase/migrations/001_reviews.sql`
   2. `supabase/migrations/002_advisor_fixes.sql`
   3. `supabase/migrations/003_guest_reviews.sql`
   4. `supabase/migrations/004_views_without_auth_users.sql`
   5. `supabase/seed/blocked_terms.sql`
   6. `supabase/seed/excluded_places.sql`
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
   - Guests: see `docs/NEEDS_FROM_ME.md` for the exact settings (anonymous sign-ins, Turnstile captcha) and the
     order to switch them on in.
4. **Set the environment variables** (Vercel → Project → Settings → Environment Variables, or `.env.local` when
   working locally; see `.env.example`):
   ```
   NEXT_PUBLIC_REVIEWS_ENABLED=1
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=nust.edu.pk,seecs.edu.pk
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Turnstile site key>
   ```
   Use the **anon** key from Project Settings → API. **Never** use the `service_role` key anywhere in this app: it
   bypasses every rule above. The Turnstile **secret** key goes into Supabase only, never into the app.
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
- `rls.sql` also covers guests: no writes without a profile, guest name rules, forced user ids and names, no
  reading other people's rows, the 5-writes and 3-reports limits, half-weight guest reports (5 keep a review up,
  6 hide it), a guest token claiming a university email still counted as a guest, "Delete my data", and an
  upgraded guest getting the NUST label.
- `supabase/tests/guest-name-cases.json` is shared like `text-cases.json`: SQL `private.name_violation()` and the
  client `guestNameViolation()`.
- `supabase/tests/live_checks.sql` runs the same kind of checks on the **real** Supabase project (SQL Editor). It
  plays anonymous visitors, signed-in users and guests through the real `anon` / `authenticated` roles, then always
  rolls everything back (including the test rows it adds to `auth.users`), so nothing is left behind. The result is
  the error message: `LIVE CHECKS: 81 passed, 0 failed` on the live project with migrations 001 to 004
  (2026-11-15).
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
  Guests: `update public.review_limits set guest_writes_per_hour = 5, guest_reports_per_day = 3, guest_report_weight = 0.5;`
- **Guest names**: `select * from public.profiles order by created_at desc;` (owner only). Empty anonymous
  accounts pile up over time; Authentication → Users can filter and delete anonymous users.
- **Reported reviews**: `select * from public.reviews where report_count > 0 order by report_count desc;`
  - To restore a review: `update public.reviews set hidden = false where id = '...';` (run this as the project
    owner in the SQL editor).
  - To clear its reports: `delete from public.review_reports where review_id = '...';`
- **Removing a person entirely**: "Delete my data" removes their content. Their sign-in record (email address in
  `auth.users`) can only be removed by the project owner, under Authentication → Users.

## Advisor notes

Supabase's security and performance advisors were run after the migrations (2026-11-15). `002_advisor_fixes.sql`
fixed: trigger functions callable over `/rest/v1/rpc`, `email_allowed()` exposed in the API schema (now
`private.email_allowed()`), per-row `auth.uid()` in policies, and `write_log` without a primary key.

Left alone on purpose:

- **Security definer views** (`public_reviews`, `place_rating_summary`, `food_rating_summary`, ERROR level): this is
  the design. The base tables only let people read their own rows; these views are the one public window, and
  they return no user ids. Making them `security_invoker` would mean either opening the base tables (and user ids)
  to everyone, or an empty map.
- **RLS enabled, no policy** on `allowed_domains`, `blocked_terms`, `excluded_places`, `review_limits`,
  `write_log` (INFO): deny-all is intended. Only the owner and `security definer` functions read them.
- **`delete_my_data()` callable by signed-in users** (WARN): it is the "Delete my data" button, and it only deletes
  the caller's own rows.
- **Unused indexes** (INFO): the database is new; they serve the per-place, per-cafe and rate-limit lookups.
- **Exposed Auth Users** (ERROR after `003`, **fixed by `004`**): `003` had the three public views join
  `auth.users` for the NUST / Guest label. `004` moves that lookup into `private.author_kind(uid)`, which returns
  only `'nust'`, `'guest'` or null. Because Postgres checks a view's function calls against the reader, `anon` and
  `authenticated` get `USAGE` on `private` and `EXECUTE` on that one function only; `private` is not served by the
  API, and the tests check that the other `private` functions stay closed to `anon`.

## Food item keys

Ratings are attached to a stable key per dish (`<cafeId>/<slug>`), not to the cafe site's own ids, which are list
positions. `npm run menus` keeps `data/menus/item-keys.json`:

- Existing keys never change or get reused.
- New dishes get new keys.
- `npm run menus -- --keys-only` adds keys to the menus already on disk without using the network.

When a cafe renames a dish, edit `item-keys.json` so the new `"<category>|<new name>"` points at the old key, and
the dish keeps its ratings.

## Files

| File                                                   | What it is                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `supabase/migrations/001_reviews.sql`                  | Tables, views, RLS, triggers, text checks, limits, RPC                |
| `supabase/migrations/002_advisor_fixes.sql`            | Advisor fixes (see "Advisor notes")                                   |
| `supabase/migrations/003_guest_reviews.sql`            | Guests: profiles, guest limits and report weight, NUST / Guest labels |
| `supabase/migrations/004_views_without_auth_users.sql` | Public views read the label through `private.author_kind()`           |
| `supabase/tests/live_checks.sql`                       | Checks against the real project; always rolls back                    |
| `supabase/seed/*.sql`                                  | Blocked terms; excluded (prayer and medical) places                   |
| `supabase/tests/rls.sql`                               | Database checks (run by `tests/reviewsDb.test.ts`)                    |
| `src/lib/reviews/`                                     | Types, config, text check, cached client, Supabase and memory stores  |
| `src/components/reviews/`                              | Reviews section, food rating pill and rater, sign-in                  |
