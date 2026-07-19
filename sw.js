const CACHE_NAME = 'muscu-v5';
// Relative paths so they resolve under the SW scope (works whether the site
// is served from the domain root or from a /Skin_grinding/ project path).
const ASSETS = [
  './',
  './programme_muscu.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // allSettled: a single 404 must not fail the whole install,
      // otherwise the new SW never activates and updates get stuck.
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, bypassing the HTTP cache ({cache:'no-store'}) so an online
// user always gets the freshly deployed page. Falls back to the cached copy
// only when offline / the network fails.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
