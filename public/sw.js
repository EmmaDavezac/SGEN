import { precacheAndRoute } from 'workbox-precaching';

// Service Worker con versionado y precache generado por Vite (Workbox)
const CACHE_VERSION = 'v15';
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// precache manifest será inyectado por `vite-plugin-pwa` durante el build
precacheAndRoute(self.__WB_MANIFEST || []);

// Activar y limpiar caches antiguas
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // No borramos las cachés de precache (Workbox las administra).
    // Limpiamos únicamente la caché runtime antigua si existe.
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== RUNTIME_CACHE && key.startsWith('runtime-')) return caches.delete(key);
      return null;
    }));
    await self.clients.claim();
  })());
});

// Fetch: navegación network-first, otros recursos stale-while-revalidate
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // No interceptar ciertos orígenes externos y CDNs
  if (
    e.request.url.includes('script.google.com') ||
    e.request.url.includes('script.googleusercontent.com') ||
    e.request.url.includes('script.gstatic.com') ||
    e.request.url.includes('googleapis.com') ||
    e.request.url.includes('cdnjs.cloudflare.com')
  ) {
    return;
  }

  // Si es navegación, network-first con fallback al precache (index.html)
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const networkResponse = await fetch(e.request);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(e.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        return caches.match('/index.html');
      }
    })());
    return;
  }

  // Para otros recursos: stale-while-revalidate en caché runtime
  e.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(e.request);
    const networkPromise = fetch(e.request).then(async (networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        await cache.put(e.request, networkResponse.clone());
      }
      return networkResponse;
    }).catch(() => null);
    return cachedResponse || networkPromise;
  })());
});

// Mensajes desde la página: permitir forzar skipWaiting o limpiar cachés
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'clearCaches') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});