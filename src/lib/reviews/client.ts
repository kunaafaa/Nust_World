/**
 * The one entry point the UI uses: picks the store, caches reads for 5 minutes, keeps public reads in
 * localStorage so cards still show ratings offline (read-only), and refuses writes while offline.
 * The Supabase store (and @supabase/supabase-js) is loaded only on first use.
 */
import { DEMO_DOMAINS, ALLOWED_EMAIL_DOMAINS, reviewsMode } from './config';
import { REVIEW_LIMITS, ReviewError, type ReviewStore } from './types';
import { DEMO_SEED } from './demoSeed';

let storePromise: Promise<ReviewStore | null> | null = null;

export function getStore(): Promise<ReviewStore | null> {
  if (storePromise) return storePromise;
  const mode = typeof location === 'undefined' ? 'off' : reviewsMode(location.search);
  storePromise = (async () => {
    if (mode === 'memory') {
      const { MemoryStore } = await import('./memoryStore');
      const domains = ALLOWED_EMAIL_DOMAINS.length ? ALLOWED_EMAIL_DOMAINS : DEMO_DOMAINS;
      return new MemoryStore({ domains, seed: DEMO_SEED });
    }
    if (mode === 'supabase') {
      try {
        const { SupabaseStore } = await import('./supabaseStore');
        return new SupabaseStore();
      } catch {
        storePromise = null; // chunk failed to load (offline on first use): try again next time
        return null;
      }
    }
    return null;
  })();
  return storePromise;
}

/** Test hook: forget the chosen store and every cached value. */
export function resetReviewsClient() {
  storePromise = null;
  mem.clear();
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// ---------------------------------------------------------------------------------------------- cache

interface Entry {
  at: number;
  value: unknown;
}
const LS_KEY = 'nw-reviews-cache';
const LS_MAX = 60;
const mem = new Map<string, Entry>();

function readLs(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}
function writeLs(key: string, e: Entry) {
  try {
    const all = readLs();
    all[key] = e;
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    for (const k of keys.slice(LS_MAX)) delete all[k];
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: the in-memory cache still works */
  }
}

export interface Cached<T> {
  value: T;
  /** served from cache while offline (or after a failed fetch) */
  stale: boolean;
}

/**
 * Read through the cache. `persist` = public data that may be kept on the device (never per-user data).
 * The memory store is never persisted, so demos and tests always start clean.
 */
export async function cachedRead<T>(
  key: string,
  fetcher: (s: ReviewStore) => Promise<T>,
  opts: { persist?: boolean; fresh?: boolean } = {},
): Promise<Cached<T> | null> {
  const store = await getStore();
  if (!store) return null;
  const persist = !!opts.persist && store.kind === 'supabase';
  const hit = mem.get(key) ?? (persist ? readLs()[key] : undefined);
  const now = Date.now();
  if (hit && !opts.fresh && now - hit.at < REVIEW_LIMITS.cacheMs)
    return { value: hit.value as T, stale: false };
  if (isOffline()) {
    if (hit) return { value: hit.value as T, stale: true };
    throw new ReviewError('Offline: reviews will load when you are back online.', 'offline');
  }
  try {
    const value = await fetcher(store);
    const e = { at: now, value };
    mem.set(key, e);
    if (persist) writeLs(key, e);
    return { value, stale: false };
  } catch (err) {
    if (hit) return { value: hit.value as T, stale: true };
    throw err;
  }
}

/** Drop cached values whose key starts with one of the prefixes (after a write). */
export function invalidate(...prefixes: string[]) {
  for (const k of [...mem.keys()]) if (prefixes.some((p) => k.startsWith(p))) mem.delete(k);
  try {
    const all = readLs();
    let changed = false;
    for (const k of Object.keys(all))
      if (prefixes.some((p) => k.startsWith(p))) {
        delete all[k];
        changed = true;
      }
    if (changed) localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Run a write: refused offline; on success the given cache prefixes are dropped. */
export async function write(fn: (s: ReviewStore) => Promise<void>, ...prefixes: string[]) {
  if (isOffline())
    throw new ReviewError('You are offline. Reviews are read-only until you reconnect.', 'offline');
  const store = await getStore();
  if (!store) throw new ReviewError('Reviews are not available.', 'server');
  await fn(store);
  invalidate(...prefixes);
}
