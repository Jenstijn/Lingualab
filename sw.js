
const CACHE_NAME = 'lingualab-cache-v17';

const ASSETS = [
  './',
  './index.html',
  './today.html',
  './progress.html',
  './train.html',
  './camera.html',
  './srs2.js',
  './manifest.webmanifest',
  './sw.js',
  './icon-192.png',
  './icon-512.png'
  './ll-typography.css',
  './ll-header.html',
'./ll-nav.js',
  './ll-brazil-ipad-v2.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Network-first for HTML, cache-first for others
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, resClone));
        return res;
      }).catch(() => caches.match(req))
    );
  } else {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, resClone));
        return res;
      }))
    );
  }
});
