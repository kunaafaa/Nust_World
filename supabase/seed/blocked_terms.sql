-- Blocked terms for review text and display names. Keep identical to src/lib/reviews/blockedTerms.ts
-- (tests/reviewText.test.ts compares them). Add more with:
--   insert into public.blocked_terms (term) values ('newterm') on conflict do nothing;
insert into public.blocked_terms (term) values
  ('asshole'),
  ('bastard'),
  ('behenchod'),
  ('bhenchod'),
  ('bitch'),
  ('bullshit'),
  ('chutiya'),
  ('cunt'),
  ('dick'),
  ('fag'),
  ('faggot'),
  ('fuck'),
  ('fucker'),
  ('fucking'),
  ('gandu'),
  ('harami'),
  ('haramzada'),
  ('kanjar'),
  ('kutti'),
  ('madarchod'),
  ('motherfucker'),
  ('nigga'),
  ('nigger'),
  ('penchod'),
  ('randi'),
  ('retard'),
  ('shit'),
  ('slut'),
  ('whore')
on conflict (term) do nothing;
