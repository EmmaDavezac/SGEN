# AGENTS.md — Reglas para agentes (y humanos) que trabajan en SGEN

> Este archivo es la fuente de autoridad operativa del repo. La guía visual
> (`GUIA_VISUAL.md`) manda en UI; este archivo manda en **cómo se trabaja**.

## Versionado de la PWA (regla obligatoria en cada commit)

Cada commit que cambie UI, lógica, estilos o el service worker **DEBE** subir
la versión del service worker para forzar la actualización en los clientes
instalados. Sin esto, la PWA sigue sirviendo la versión vieja cacheada.

1. **Subir `CACHE_VERSION` en `public/sw.js`** (hoy `v25`):
   ```js
   const CACHE_VERSION = 'v26'; // +1 en cada commit con cambios de app
   ```
   - El nombre del caché runtime (`runtime-<versión>`) cambia, el `activate`
     borra el runtime viejo y `skipWaiting()` + `clients.claim()` toman el
     control de inmediato.
   - El SW avisa a las páginas con `{ type: 'APP_VERSION', version }`.
2. **No tocar** `updateViaCache: 'none'` en `src/react-main.jsx` ni el
   `globIgnores: ['**/*.html']` en `vite.config.js`: así el navegador chequea
   `/sw.js` contra la red en cada visita y el HTML nunca queda precacheado.
3. **Animación de actualización (obligatoria, no salto abrupto)**:
   - Al recibir `APP_VERSION` (o `controllerchange` como respaldo), la app
     muestra `AppUpdateOverlay` ("Actualizando a la nueva versión…" con el
     corazón de la marca latiendo, reutilizando `.loader-overlay` y
     `.heart-spinner`) durante ~1.2s (`APP_UPDATE_OVERLAY_MS` en
     `src/appUpdate.js`) y recién ahí recarga.
   - Lógica en `src/appUpdate.js` (`initAppVersionWatcher`), overlay en
     `src/components/AppUpdateOverlay.jsx`, montado en `src/react-main.jsx`.
   - Sin emojis (GUIA_VISUAL). Sin botones ni confirmaciones: la actualización
     es automática y silenciosa salvo el overlay.
4. **Verificar** con `npm run build` (genera `dist/sw.js` vía `injectManifest`)
   antes de commitear.

## Convenciones de commits

- Prefijos: `fix(...)`, `feat(...)`, `chore(...)`, `docs(...)`.
- Si el commit incluye bump de versión del SW, mencionarlo en el mensaje
  (ej. `fix(pwa): ... (SW v22 → v23)`).
- No commitear `dist/` (está en `.gitignore`): el deploy lo reconstruye.

## Historial de versiones (changelog)

Cada versión publicada **DEBE** documentar sus cambios en `docs/CHANGELOG.md` para generar un historial con la información de cada versión y los commits asociados.

1. **Entrada por versión**: agregar una entrada con número de versión, fecha, resumen de cambios (UI, lógica, estilos, service worker) y la versión de `CACHE_VERSION` correspondiente.
2. **Commits de la versión**: listar los commits (hash corto + mensaje) que conforman la versión, agrupados bajo la entrada de versión.
3. **Formato de entrada** (ejemplo):

   ```markdown
   ## v1.2.0 — 2026-10-15 (SW v25)

   ### Cambios
   - Teclado numérico en inputs de cantidad/precio (`inputMode="numeric"`).
   - Retroalimentación táctil (`:active`) en botones y `.nav-item`.
   - Bloqueo de scroll del fondo al abrir modales/drawers (`body.no-scroll`).
   - `font-size: 16px` en inputs para evitar auto-zoom en iOS.
   - `overscroll-behavior: contain` en `html, body` para parar el rebote elástico.

   ### Commits
   - c177e6a feat(mobile): numeric keyboard, tap feedback, scroll lock, font size, overscroll contain (SW v24 → v25)
   ```

4. **Actualizar en cada release**: al crear una tag o release, cerrar la entrada anterior y añadir la nueva con sus commits.
