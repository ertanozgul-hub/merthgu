const CACHE_NAME = 'mert-erp-v1';

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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
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
