import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/security/headers';

/**
 * Sets a per-request Content-Security-Policy with a fresh nonce on page documents. Next.js reads the nonce from the
 * request header and puts it on its own scripts (see node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md). Static files, data and the service worker do not need it.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|data/|photos/|sw\\.js|manifest\\.webmanifest|icon|og-map\\.png|robots\\.txt|sitemap\\.xml|favicon\\.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
