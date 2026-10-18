import { precacheAndRoute } from 'workbox-precaching';

// Service Worker con versionado y precache generado por Vite (Workbox)
//
// IMPORTANTE: index.html y 404.html NO van en el precache (se excluyen con
// globIgnores en vite.config.js). Antes sí estaban, y workbox respondía las
// navegaciones con el HTML cacheado (cache-first) ANTES de que corriera el
// network-first de abajo: un rebuild nunca llegaba al navegador hasta que
// este service worker se actualizara, y la UI seguía con la versión vieja
// (p. ej. el overlay de progreso quedaba con z-index bajo los modales).
const CACHE_VERSION = 'v57';
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Guardamos el manifest antes de consumirlo para saber qué requests cubre
// workbox y no duplicar respondWith en el handler custom de abajo.
// (La inyección de vite-plugin-pwa debe ser UNA sola aparición de __WB_MANIFEST.)
const PRECACHE = self.__WB_MANIFEST || [];
const PRECACHE_URLS = new Set(
  PRECACHE.map((entry) =>
    new URL(typeof entry === 'string' ? entry : entry.url, self.location.href).href
  )
);

// Fetch: navegación network-first, otros recursos stale-while-revalidate.
// Este listener va ANTES de precacheAndRoute: las navegaciones nunca matchean
// el precache (el HTML queda excluido), así que no hay doble respondWith.
self.addEventListener('fetch', (e) => {
  if (new URL(e.request.url).origin !== self.location.origin) return;

  // Si es navegación, network-first; offline: última navegación del runtime cache o shell index.html.
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const networkResponse = await fetch(e.request);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(e.request, networkResponse.clone());
          cache.put('/index.html', networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        return (await caches.match(e.request)) || (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Si workbox lo tiene en el precache (assets con hash), lo responde él.
  if (PRECACHE_URLS.has(e.request.url)) return;

  // El resto: stale-while-revalidate en caché runtime.
  e.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(e.request);
    const networkPromise = fetch(e.request).then(async (networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        await cache.put(e.request, networkResponse.clone());
      }
      return networkResponse;
    }).catch(() => cachedResponse || Response.error());
    return cachedResponse || networkPromise;
  })());
});

// precache manifest (inyectado por `vite-plugin-pwa` durante el build)
precacheAndRoute(PRECACHE);

// Activar la nueva versión inmediatamente en los clientes existentes.
self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

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
    // Avisar a las páginas que hay una versión nueva activa, para que
    // muestren el overlay de actualización (~1.2s) antes de recargar.
    // Ver AGENTS.md, regla "Versionado de la PWA".
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => {
      try {
        client.postMessage({ type: 'APP_VERSION', version: CACHE_VERSION });
      } catch (err) { /* ignore */ }
    });
  })());
});

// Mensajes desde la página: permitir forzar skipWaiting o limpiar cachés
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    try {
      event.source?.postMessage?.({ type: 'APP_VERSION', version: CACHE_VERSION });
    } catch (err) { /* ignore */ }
    return;
  }
  if (event.data === 'clearCaches') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});