'use client';
import { useEffect } from 'react';
import { warmMenus } from '@/lib/menu';

/** Registers the offline service worker in production only (dev HMR and a cache do not mix). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      // updateViaCache 'none': always check /sw.js itself on the network, so a new version is picked up at once
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
      // After the first load, when idle: fetch the small menu chunks once so the service worker caches them.
      const idle = (f: () => void) =>
        window.requestIdleCallback
          ? window.requestIdleCallback(f, { timeout: 4000 })
          : window.setTimeout(f, 4000);
      const t = window.setTimeout(() => idle(warmMenus), 6000);
      return () => window.clearTimeout(t);
    }
  }, []);
  return null;
}
