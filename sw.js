const CACHE_NAME = 'lamable-trip-v1';
const TILE_CACHE = 'lamable-tiles-v1';

// Core assets to cache immediately
const CORE_ASSETS = [
  './',
  './index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== TILE_CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Cache map tiles separately (CartoDB / OSM tiles)
  const isTile = url.hostname.includes('carto') ||
                 url.hostname.includes('tile.openstreetmap') ||
                 url.hostname.includes('basemaps');

  if (isTile) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // Core HTML/assets — cache-first
  if (url.pathname.endsWith('.html') || url.pathname === '/lamable-trip-guide/' || url.pathname === '/lamable-trip-guide/index.html') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
  }
});

// Listen for "cache-tiles" message from main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_TILES') {
    const tiles = event.data.tiles;
    caches.open(TILE_CACHE).then(cache => {
      let done = 0;
      tiles.forEach(url => {
        fetch(url).then(r => {
          if (r.ok) cache.put(url, r);
          done++;
          if (done === tiles.length) {
            self.clients.matchAll().then(clients =>
              clients.forEach(c => c.postMessage({ type: 'CACHE_DONE', count: done }))
            );
          }
        }).catch(() => { done++; });
      });
    });
  }
});
