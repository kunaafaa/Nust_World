'use client';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { sanitizeAnalyticsUrl } from '@/lib/security/analytics';

/**
 * Vercel Analytics with sanitised URLs (path + ?place= only). Custom events (track()) only ever carry place ids or
 * category names; never text people type, and never location.
 */
const beforeSend = (e: BeforeSendEvent): BeforeSendEvent => ({
  ...e,
  url: sanitizeAnalyticsUrl(e.url),
});

export function SafeAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
