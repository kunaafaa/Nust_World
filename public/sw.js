/* NUST World service worker: the campus works offline after the first visit.
   - App shell + map data are precached.
   - Everything else same-origin is cached as you browse (stale-while-revalidate).
   Bump VERSION to force clients to refresh their cache. */
const VERSION = 'v3-edge';
const CACHE = `nust-world-${VERSION}`;
const PRECACHE = ['/', '/data/nust-full.geojson', '/data/topo-merge.json', '/data/topo-trees.json', '/data/topo-terrain.json', '/data/campus-boundary.geojson', '/data/context-roads.json', '/manifest.webmanifest', '/icon.svg', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('nust-world-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Navigations: network first so deploys show up, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('/', c)); return r; }).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }),
  );
});
