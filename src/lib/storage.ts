/**
 * Safe localStorage access. Storage can be blocked (private mode, policy), full, or hold an old or corrupt value,
 * so every read has a fallback and every write is best effort. Only preferences and place ids are stored here:
 * no tokens, no personal data (Supabase keeps its own session; see docs/SECURITY_REVIEW.md).
 */

/** A list of short id strings (place ids, collectible ids), or [] if missing or malformed. */
export function readIdList(key: string, max = 200): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.length <= 120).slice(0, max)
      : [];
  } catch {
    return [];
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* blocked or full: the app works without it */
  }
}
