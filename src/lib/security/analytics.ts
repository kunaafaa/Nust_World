/**
 * Analytics URLs are reduced to what is safe to count: the path plus ?place= (a public place id). Everything else is
 * dropped: sign-in codes (?code=), developer flags, and any parameter added in future.
 */
export function sanitizeAnalyticsUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const place = u.searchParams.get('place');
    u.search = '';
    u.hash = '';
    if (place && /^[a-z0-9][a-z0-9-]{0,79}$/.test(place)) u.searchParams.set('place', place);
    return u.toString();
  } catch {
    return '/';
  }
}
