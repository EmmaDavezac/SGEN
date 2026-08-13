// Service Worker para cacheo básico (Network-first con fallback a Cache)
const CACHE_NAME = 'evolet-nails-v13';
const ASSETS = [
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/logo.png'
];

// Instalar y cachear recursos (no fallar si algún asset no existe)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        ASSETS.map((url) => cache.add(url))
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.warn('No se pudo cachear:', ASSETS[i], result.reason);
        }
      });
    }).then(() => self.skipWaiting())
  );
});

// Activar y limpiar caches antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar peticiones (Network-first)
self.addEventListener('fetch', (e) => {
  // Evitar interceptar llamadas a la API de Google Sheets y Google Calendar
  if (e.request.url.includes('script.google.com') || e.request.url.includes('googleapis.com')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => caches.match(e.request))
  );
});