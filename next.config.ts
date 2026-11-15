import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security/headers';

// The Content-Security-Policy is per request (it carries a nonce), so it is set in src/proxy.ts, not here.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      // The service worker must never be served from an HTTP cache, or updates stall.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
export default nextConfig;
