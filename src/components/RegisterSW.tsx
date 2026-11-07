'use client';
import { useEffect } from 'react';

/** Registers the offline service worker in production only (dev HMR and a cache do not mix). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
