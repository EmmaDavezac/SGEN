# Changelog — SGEN

## v1.3.4 — 2026-10-15 (SW v36)

### Cambios
- White-label / multi-negocio: nombre del negocio, logo, moneda, textos del negocio y colores de marca dejan de estar hardcodeados. Se configuran en `src/businessConfig.js` (BUSINESS + TEMAS).
- `src/theme.js`: inyecta las CSS custom properties del tema activo en `:root`, permitiendo cambiar de tema sin recargar y añadir temas nuevos sumando entradas al diccionario `TEMAS`.
- `style.css`: variables de marca renombradas de `--barbie-*` a `--brand-*` (genéricas), con valores por defecto del tema actual. Los temas las sobrescriben desde JS sin tocar la hoja de estilos.
- `scripts/generar-assets-negocio.mjs`: regenera `index.html`, `404.html` y `public/manifest.json` con el nombre del negocio activo al hacer build.
- Pantalla de login, header, footer, About, tickets y paneles usan `BUSINESS.nombre` en lugar de "Evolet Studio" hardcodeado.
- Bump de `CACHE_VERSION` en `public/sw.js` (v35 → v36) para forzar la actualización del service worker en clientes instalados.

### Commits
- (hash se completa tras el commit)

## v1.3.3 — 2026-10-15 (SW v35)

### Cambios
- Lenguaje neutro: todas las referencias a "clienta"/"clientas" pasan a "cliente"/"clientes" en UI, documentos, comentarios, migraciones SQL y scripts (textos visibles y comentarios; sin tocar nombres de esquema ni identificadores ajenos al español).
- Ajuste de concordancia de género en mensajes de notificación tras el cambio de sustantivo ("Cliente agregado correctamente", "Cliente eliminado del sistema", etc.).
- Bump de `CACHE_VERSION` en `public/sw.js` (v34 → v35) para forzar la actualización del service worker en clientes instalados.

### Commits
- cc99c7a feat(i18n): lenguaje neutro: "clienta"/"clientas" a "cliente"/"clientes" en toda la app (SW v34 → v35)

## v1.3.2 — 2026-10-15 (SW v34)

### Cambios
- Texto de pantalla de carga de sesión: "Verificando sesión…" → "Ingresando…" (aria-label y subtítulo en App.jsx).
- Bump de `CACHE_VERSION` en `public/sw.js` (v33 → v34) para forzar la actualización del service worker en clientes instalados.

### Commits
- fix(ui): cambiar texto de carga de sesión de "Verificando sesión" a "Ingresando" (SW v33 → v34)

## v1.3.1 — 2026-10-15 (SW v33)

### Cambios
- Fix crítico: `Toast.jsx` se importaba a sí mismo (recursión infinita) provocando pantalla blanca al cargar la app. Ahora es solo el componente visual que consume `ToastContext` (que `App.jsx` ya provee mediante `ToastProvider`).
- Bump de `CACHE_VERSION` en `public/sw.js` (v32 → v33) para forzar la actualización del service worker en clientes instalados.

### Commits
- fix(ui): arreglar importación recursiva en Toast.jsx que causaba pantalla blanca (SW v32 → v33)

## v1.3.0 — 2026-10-15 (SW v32)

### Cambios
- Regla de negocio: un usuario no puede crear dos `turnos` solapados al mismo tiempo.
  - `saveAppointmentToDatabase` valida antes del `insert` que no exista otro turno (no cancelado) del mismo usuario en la misma fecha con horario solapado, y lanza un error claro si lo hay.
  - `updateAppointmentInDatabase` aplica la misma validación al reagendar, excluyendo el turno que se está editando para que no choque consigo mismo.
- Bump de `CACHE_VERSION` en `public/sw.js` (v31 → v32) para forzar la actualización del service worker en clientes instalados.

### Commits
- 1887e7c feat(turnos): bloquear creación y reagendamiento de turnos solapados para el mismo usuario (SW v31 → v32)
