# Decisions

Short records of the decisions that shape the project. Newest last. To change one, add a new record that replaces
it; do not edit history.

## D1. The outline look is locked

- **Decision:** buildings are drawn as fat 1.5 px edge lines in category colours over almost transparent faces
  (7 % opacity) on a dark navy world with a soft bloom. This "Night Outline" style is the product's identity.
- **Why:** it reads well on phones at night and in daylight, hides missing detail honestly, and stays fast.
- **Consequences:** no textured or photo-real buildings. New layers (terrain, hostels, provisional buildings) must
  use the same style. Visual changes need the owner's approval and updated visual baselines
  (`e2e/__screenshots__`).

## D2. OpenStreetMap is the only source of truth for the map

- **Decision:** the runtime map is `public/data/nust-full.geojson` (OSM, ODbL), with `src/data/landmarks.ts` as the
  owner's verified overrides (matched by numeric `osmId`, never by name). Fixes go into OSM first, then
  `npm run refresh-data -- --apply`. No Google Maps data or imagery, anywhere.
- **Why:** a clear licence (ODbL), a way for anyone to fix the map, and no data we are not allowed to publish.
- **Consequences:** missing buildings show as missing (with a report) rather than invented. The Overture merge (D3)
  only adds to OSM and can be switched off (`?topo=off`).

## D3. Reference-only data never ships

- **Decision:** TopoExport files under `/reference` (DXF/SVG cross-sections and plans) are used only to check
  positions and heights. They are never copied into `/public`, the geojson, `landmarks.ts`, `heights.ts` or any
  deployed asset. Overture data, which has a clear ODbL licence, is merged non-destructively by
  `npm run topo-merge` and credited in the footer and `LICENSE-DATA.md`.
- **Why:** the export terms of the reference files are not stated. Checking against them is fine; publishing them
  is not.
- **Consequences:** `/reference` is git-ignored. No terrain layer from reference data; the optional terrain comes
  from CC BY 4.0 data and is off by default.

## D4. Never invent facts

- **Decision:** unknown values show "Info coming soon"; unverified places carry an "unverified" tag; buildings
  without an entrance route to the nearest path and say "(approximate entrance)"; hostels without an outline use a
  template footprint tagged "approximate shape".
- **Why:** people use this to find rooms and exams. A wrong answer is worse than "not known".

## D5. Reviews design

- **Decision:** reviews and food ratings run on Supabase with the **anon key only**. Every rule lives in the database
  (`supabase/migrations/001_reviews.sql`): row-level security, triggers that force the user id, text rules, rate
  limits, hiding after reports, excluded places (prayer, medical). Sign-in is a magic link to an allowed
  university email domain. Public reads go through views that never expose user ids.
- **Why:** a modified client cannot get around rules that the database enforces. No server code to run or secure.
- **Consequences:** the feature is off until the owner sets it up (`docs/REVIEWS_SETUP.md`). The client mirrors the
  rules only to give early, friendly messages. The Supabase code loads only when reviews are on.

## D6. Strict, nonce-based Content Security Policy

- **Decision:** `src/proxy.ts` sets a per-request nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`).
  `style-src` keeps `'unsafe-inline'` because React and framer-motion use style attributes.
- **Why:** blocks injected scripts even if a rendering bug ever slips in.
- **Consequences:** `/` is rendered per request instead of prerendered (a small shell; the service worker serves it
  offline). Any new third-party origin must be added on purpose; the e2e suite fails on violations.

## D7. Developer tools stay in production for now

- **Decision:** `?debug`, `?simulate`, `?perf`, `?shots`, `?reviews=memory`, `?topo=off` and `?edge=off` work while
  `NEXT_PUBLIC_DEV_TOOLS` is on, which is the default during field testing.
- **Why:** the owner tests on real phones on campus with the production build.
- **Consequences:** set `NEXT_PUBLIC_DEV_TOOLS=0` in Vercel once field testing is over (`docs/NEEDS_FROM_ME.md`).
