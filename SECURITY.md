# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

- Contact: GitHub [@kunaafaa](https://github.com/kunaafaa). Use GitHub's private vulnerability reporting
  ("Report a vulnerability" under the repository's Security tab) if it is enabled. Otherwise, open an issue that
  only asks for a private contact, without any details.
- An email address will be added here later.

Please include what you found, how to reproduce it, and what an attacker could do with it. You should get a reply
within a week. Please give us a reasonable time to fix the problem before you disclose it.

## Scope

- The site (Next.js app, service worker, security headers).
- The reviews database rules in `supabase/migrations/` (row-level security, triggers, rate limits).
- Secrets accidentally committed to this repository.

Out of scope: OpenStreetMap or Overture data errors (use "Report a mistake" in the app), denial of service by
sending lots of traffic, and issues in third-party services (Vercel, Supabase) themselves.

## How this project handles security

See [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) for the threat model, the findings and their status.
