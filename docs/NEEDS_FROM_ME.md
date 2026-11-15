# Needs from the owner

Things only you can do (accounts, keys, decisions). Everything else is done.

Reviews, food ratings and guest reviews: the Supabase project (`https://osaxtdvcwfxxdgggjgmd.supabase.co`) has
migrations 001 to 004 and both seeds, with the advisors reviewed and `supabase/tests/live_checks.sql` passing on
the live project (81/81, 2026-11-15, rolled back; every user-data table and `auth.users` still empty).
`.env.local` has the local values.

Do the steps below **in this order**. Once captcha protection is on in Supabase, _every_ sign-in (guest and email)
must carry a Turnstile token. The deployed site only sends one after step 2, so switching on step 4 earlier
breaks email sign-in on the live site.

## 1. Cloudflare Turnstile: create the widget

Cloudflare dashboard → Turnstile → Add widget:

- **Hostnames:** your production domain (for example `nust-world.vercel.app`) and `localhost`.
- **Widget mode:** Managed.
- Copy the **site key** (public) and the **secret key** (private).

## 2. Vercel environment variables, then redeploy

Vercel → Project → Settings → Environment Variables (Production, and Preview if you want it there):

```
NEXT_PUBLIC_REVIEWS_ENABLED=1
NEXT_PUBLIC_SUPABASE_URL=https://osaxtdvcwfxxdgggjgmd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the "anon" key: Supabase → Project Settings → API Keys, or copy from .env.local>
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=nust.edu.pk,seecs.edu.pk
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Turnstile site key from step 1>
```

The **anon** key only, never `service_role`. The Turnstile **secret** key does not go in Vercel. Add the same
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` line to `.env.local` for local testing.

## 3. Supabase: allow anonymous sign-ins

Supabase → Authentication → Sign In / Providers → User Signups → **Allow anonymous sign-ins: on**. Save.

## 4. Supabase: captcha protection

Supabase → Authentication → Attack Protection → **Enable Captcha protection: on**:

- **Choose Captcha Provider:** Turnstile by Cloudflare.
- **Captcha secret:** the Turnstile **secret key** from step 1. Save.

## 5. Supabase Auth: Site URL and redirect URLs

Supabase → Authentication → URL Configuration:

- **Site URL:** the production URL (for example `https://nust-world.vercel.app`).
- **Redirect URLs:** add the production URL with `/**` (for example `https://nust-world.vercel.app/**`) and
  `http://localhost:3000/**`.

Without this, the magic link (and the guest "verify your NUST email" link) sends people to the wrong place.

## 6. Supabase Auth: SMTP (optional)

Supabase's built-in mailer sends only a few emails an hour, and on a new project only to members of your Supabase
team. For real students to get sign-in and verification links, set up custom SMTP under Project Settings →
Authentication → SMTP Settings (any provider: Resend, Brevo, SES, ...). A guest upgrading to their NUST email gets
the "Change email address" template, so check that one reads sensibly too (Authentication → Emails).

Optional, same area: Authentication → Rate Limits → anonymous sign-ins per hour (per IP address; the default is
30). Lower it if guest accounts are abused.

### Needs my confirmation

- **Allowed email domains: `nust.edu.pk`, `seecs.edu.pk`** (unverified). Check which domains students' email
  addresses actually use (for example other schools' own domains). If the list changes, change both the
  `allowed_domains` table and `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS`, in the same way.
- **Guest rules** (my defaults, easy to change in `review_limits`): 5 writes an hour, 3 reports a day, and a guest
  report counts as half toward auto-hide (3 NUST reports or 6 guest reports hide a review).
