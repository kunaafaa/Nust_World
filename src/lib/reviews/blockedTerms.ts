/**
 * Terms rejected in review text and display names (English and romanised Urdu insults / slurs).
 * Lower-case letters only. Kept identical to supabase/seed/blocked_terms.sql (tests/reviewText.test.ts checks).
 * Matching (both sides): leetspeak folded, repeated letters collapsed, whole words; terms of 5+ letters also match
 * inside words with the spaces removed.
 */
export const BLOCKED_TERMS: readonly string[] = [
  'asshole',
  'bastard',
  'behenchod',
  'bhenchod',
  'bitch',
  'bullshit',
  'chutiya',
  'cunt',
  'dick',
  'fag',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'gandu',
  'harami',
  'haramzada',
  'kanjar',
  'kutti',
  'madarchod',
  'motherfucker',
  'nigga',
  'nigger',
  'penchod',
  'randi',
  'retard',
  'shit',
  'slut',
  'whore',
];
