# Needs from the owner

Things only you can do (accounts, keys, decisions). Everything else is done. Newest first.

## 1. Switch on reviews and food ratings (optional, whenever you are ready)

The feature is built and tested but **off**: cards show "Reviews coming soon". To turn it on, follow
`docs/REVIEWS_SETUP.md` → "Turning it on". In short:

1. Create a Supabase project (free tier).
2. In its SQL Editor, run `supabase/migrations/001_reviews.sql`, then `supabase/seed/blocked_terms.sql` and
   `supabase/seed/excluded_places.sql`.
3. **Decision:** which email domains may post. Insert them into `allowed_domains`, and put the same list in
   `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS`. The setup guide uses `nust.edu.pk` and `seecs.edu.pk` as examples; check
   which domains students actually have.
4. In Supabase Authentication, set the Site URL and Redirect URLs to the production URL (and
   `http://localhost:3000/**`). Set up custom SMTP if more than a few sign-ins an hour are expected.
5. In Vercel, add `NEXT_PUBLIC_REVIEWS_ENABLED=1`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the
   **anon** key, never `service_role`) and `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS`. Then redeploy.

To try it before any of this, open the site with `?reviews=memory` added to the URL.
