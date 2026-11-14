'use client';
import { useEffect } from 'react';
import { warmMenus } from '@/lib/menu';

/** Registers the offline service worker in production only (dev HMR and a cache do not mix). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      // After the first load, when idle: fetch the small menu chunks once so the service worker caches them.
      const idle = (f: () => void) =>
        window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 4000 }) : window.setTimeout(f, 4000);
      const t = window.setTimeout(() => idle(warmMenus), 6000);
      return () => window.clearTimeout(t);
    }
  }, []);
  return null;
}
