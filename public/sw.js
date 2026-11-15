/* NUST World service worker: the campus works offline after the first visit.
   - App shell + map data are precached.
   - Everything else same-origin is cached as you browse (stale-while-revalidate). That includes the cafe menu
     chunks, which the app fetches once when idle after first load (see lib/menu.ts warmMenus) so they open offline.
   - Never cached: non-GET requests, other origins (Supabase, anything third party), auth callbacks (?code=, /auth/),
     analytics (/_vercel/), and error responses.
   - Updates: a new worker takes over at once (skipWaiting + clients.claim). Hashed build files from the previous
     cache are carried over, so a page that is still open from the old deploy can lazy-load its chunks.
   Bump VERSION to force clients to refresh their cache. */
const VERSION = 'v5-security';
const PREFIX = 'nust-world-';
const CACHE = `${PREFIX}${VERSION}`;
const PRECACHE = [
  '/',
  '/data/nust-full.geojson',
  '/data/topo-merge.json',
  '/data/topo-trees.json',
  '/data/topo-terrain.json',
  '/data/campus-boundary.geojson',
  '/data/context-roads.json',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

/** Copy immutable /_next/static/ files from older caches, then delete the older caches. */
async function migrate() {
  const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
  const next = await caches.open(CACHE);
  for (const k of keys) {
    const old = await caches.open(k);
    for (const req of await old.keys()) {
      if (!new URL(req.url).pathname.startsWith('/_next/static/') || (await next.match(req)))
        continue;
      const res = await old.match(req);
      if (res) await next.put(req, res);
    }
    await caches.delete(k);
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    migrate()
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

/** Requests the worker must leave alone (the browser handles them normally). */
function bypass(req, url) {
  if (req.method !== 'GET' || url.origin !== location.origin) return true;
  if (url.searchParams.has('code') || url.searchParams.has('error_description')) return true; // auth callback
  return (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/_vercel/') ||
    url.pathname.startsWith('/api/')
  );
}

const cacheable = (r) => r && r.ok && r.type === 'basic';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (bypass(req, url)) return;
  // Navigations: network first so deploys show up, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (cacheable(r)) {
            const c = r.clone();
            caches.open(CACHE).then((x) => x.put('/', c));
          }
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((r) => {
          if (cacheable(r)) cache.put(req, r.clone());
          return r;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
