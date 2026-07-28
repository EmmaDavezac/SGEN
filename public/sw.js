const CACHE_NAME = 'evolet-nails-v10';
const ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './Contexto/logo.png'
];

// Instalar y Cachear recursos
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activar y Limpiar caches antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar Peticiones (Estrategia Network-First con Fallback a Cache)
self.addEventListener('fetch', (e) => {
  // Evitar interceptar llamadas a la API de Google Sheets
  if (e.request.url.includes('script.google.com')) {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Si la respuesta es válida, clonarla y guardarla en la caché
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // En caso de estar offline o fallar la red, buscar en la caché
        return caches.match(e.request);
      })
  );
});
