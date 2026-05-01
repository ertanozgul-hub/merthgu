const CACHE_NAME = 'mert-erp-v4';

// Uygulamanın internetsiz çalışması için hafızaya alınacak temel iskelet dosyaları
const urlsToCache = [
  './index.html',
  './order.html',
  './style.css',
  './app.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eski önbellek siliniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// İnternet kopsa da cihazdan verileri getir (Offline Core)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Cache'den ver
        }
        return fetch(event.request); // İnternetten çek
      })
  );
});
