# Changelog — SGEN

## v1.3.8 — 2026-10-15 (SW v50)

### Cambios
- Inputs legibles en modo oscuro: `input::placeholder` usa `var(--text-muted)` en lugar de `#aaaaaa` hardcodeado; fondos hardcodeados (`#fff4f5`, `#fff1f1`, `#fff8fa`, `#fff0f0`, `#fff8f9`, `var(--white, #fff)`) reemplazados por `var(--surface-bg)` para que respondan al tema activo.
- AboutModal con estilo flat: `.modal-card` usa `var(--surface-bg)` en lugar de `var(--glass-bg)` (fondo blanco semi-transparente que no se veía bien en modo oscuro).
- Línea divisoria en historial de turnos cobrados: `border-top` de `.client-history-heading` usa `var(--border-neutral)` en lugar de `var(--brand-pale)` para no destacar en modo oscuro.
- Input de nombre de categoría readonly usa `var(--surface-bg)` en lugar de `#faf7f8` hardcodeado (modo oscuro).
- Botones archivar/reactivar de categoría y servicio pasan a `variant='secondary'`; editar categoría y editar servicio se mantienen en `primary`.
- Botones de acciones de turno por estado: `confirmar` y `cobrar` usan `variant='primary'` (relleno, acción principal); `consultar` ya era `primary`.
- Altura uniforme (42px) entre inputs y botones del formulario de editar servicio en catálogo de precios.
- Cards de clientes con pagos pendientes (`.pending-debtor-card` y `.history-card.card-pending`) usan `var(--surface-bg)` y `var(--brand-pale)` en lugar de colores hardcodeados (`#FFE4B5`, `#FFFDF0`, `var(--white)`) para responder al modo oscuro.
- Botones de acción de turno (confirmar, cobrar, consultar) usan `variant='primary'` y ahora `.card-icon-btn--primary` tiene fondo sólido (`var(--brand-primary)`, texto blanco), cumpliendo la regla: primary = relleno sólido.
- Botones `primary` (`.card-icon-btn--primary`) en hover/active se ven como `secondary`: fondo transparente, borde `var(--brand-primary)`, texto `var(--brand-primary)`.
- Botones `secondary` (`.btn-secondary` y `.card-icon-btn--secondary`) en hover/active se ven como `primary`: fondo sólido `var(--brand-primary)`, texto blanco.
- Estilo consistente: al hacer hover, ambos variantes intercambian apariencia.
- `theme-color` dinámico: se agregó `<meta name="theme-color">` al HTML y se actualiza desde `theme.js` cuando cambia el modo claro/oscuro, así la barra de direcciones de Android y la PWA instalada cambian con el tema.
- Ajustes responsive en móvil: `.setting-row`, `.setting-select`, `.switch-toggle` y `.card-info-box` se adaptan a pantallas estrechas (max-width: 480px) para evitar desbordamiento horizontal.
- Barra de navegación inferior (`.app-nav`) en modo oscuro: el borde ahora usa `var(--brand-primary)` en lugar de `var(--brand-pale)` (que en oscuro era igual al fondo y se volvía invisible). Los `.nav-item` en hover ahora usan fondo `var(--brand-primary)` y texto `var(--white)` en lugar de `var(--brand-pale)` / `var(--brand-dark)`, para tener contraste en ambos temas.
- Bump de `CACHE_VERSION` en `public/sw.js` (v49 → v50) para forzar la actualización del service worker en clientes instalados.

### Commits
- 2823624 fix(dark-mode): category input bg, turno button hierarchy, archive secondary, service form height (SW v42 → v43)
- c54e164 fix(turnos): confirmar y cobrar usan variant primary (relleno, accion principal) (SW v43)
- 016b86a fix(dark-mode): cards de clientes con pagos pendientes responden al modo oscuro (SW v43 → v44)
- 2d1b9c9 fix(turnos): botones de accion usan variant primary con relleno solido (SW v44 → v45)
- aa21f6c fix(buttons): primary con relleno solido, secondary inline (SW v45 → v46)
- 7b8cd93 fix(buttons): primary con hover animado, secondary outline (SW v46 → v47)
- 62994ae fix(buttons): hover de primary como secondary y hover de secondary como primary (SW v47 → v48)
- b9b9780 feat(pwa): theme-color dinamico y ajustes responsive en mobile (SW v48 → v49)
- baeed7d fix(android-nav): barra inferior visible en modo oscuro (SW v49 → v50)

## v1.3.7 — 2026-10-15 (SW v41)

### Cambios
- El tema por defecto ahora sigue el dispositivo (`prefers-color-scheme`) en lugar de estar hardcodeado: si no hay elección guardada en localStorage, se usa el modo del sistema; si el dispositivo cambia de claro a oscuro, la app se adapta automáticamente.
- Eliminado el botón "Activar modo oscuro / claro" del menú de cuenta en el header.
- Agregado selector de apariencia en la pestaña Ajustes: "Seguir el dispositivo (sistema)", "Claro", "Oscuro". La elección se guarda en localStorage y se aplica sin recargar.
- `src/theme.js`: nuevas funciones `establecerModo(modo)`, `MODO_SISTEMA` constante, y `aplicarTema` resuelve `'sistema'` a claro/oscuro según `prefers-color-scheme`. `inicializarTema()` y `obtenerModo()` respetan el orden: localStorage > dispositivo > `BUSINESS.modo`.
- `BUSINESS.modo` documentado como valor de respaldo cuando no hay localStorage ni prefers-color-scheme disponible.
- Bump de `CACHE_VERSION` en `public/sw.js` (v40 → v41) para forzar la actualización del service worker en clientes instalados.

### Commits
- (pendiente de commit)

## v1.3.6 — 2026-10-15 (SW v39)

### Cambios
- Modo oscuro ahora aplica correctamente a contenedores y cards: el tema `barbie` en modo oscuro define todas las variables que el CSS usa (`--text-color`, `--text-muted`, `--text-light`, `--white`, `--color-danger`, `--color-focus`, `--color-danger-dark`, `--shadow-focus`) con los nombres exactos, y las sombras (`--shadow-md`, `--shadow-inset`) usan formato completo (offsets + color).
- `background: #ffffff` hardcodeado en `.write-progress-card` cambiado a `var(--cream-bg)` para que responda al tema activo.
- Bump de `CACHE_VERSION` en `public/sw.js` (v38 → v39) para forzar la actualización del service worker en clientes instalados.

### Commits
- ddd6dd4 fix(tema): modo oscuro aplica a contenedores y cards (SW v38 → v39)

## v1.3.5 — 2026-10-15 (SW v37)

### Cambios
- Modo oscuro para el tema barbie (mismo tema, sin crear uno nuevo): `TEMAS.barbie` ahora define `claro` y `oscuro`, y `BUSINESS.modo` selecciona el modo activo (`claro` por defecto).
- `src/theme.js`: `aplicarTema(nombreTema, modo)`, `inicializarTema()`, `obtenerModo()` y `alternarModo()` manejan tema + modo, persistiendo ambos en localStorage y inyectando las CSS custom properties en `:root` sin recargar.
- Menú de cuenta (`AppLayout.jsx`): nuevo ítem para alternar claro/oscuro (ícono luna/sol), recordando la elección por dispositivo.
- `style.css`: variables de glass, sombras, bordes y fondo crema ahora también provienen del tema activo, por lo que el modo oscuro se aplica a toda la UI sin editar la hoja de estilos.
- Bump de `CACHE_VERSION` en `public/sw.js` (v36 → v37) para forzar la actualización del service worker en clientes instalados.

### Commits
- 9081ffa feat(tema): modo oscuro para el tema barbie (mismo tema, sin crear uno nuevo) (SW v36 → v37)

## v1.3.4 — 2026-10-15 (SW v36)

### Cambios
- White-label / multi-negocio: nombre del negocio, logo, moneda, textos del negocio y colores de marca dejan de estar hardcodeados. Se configuran en `src/businessConfig.js` (BUSINESS + TEMAS).
- `src/theme.js`: inyecta las CSS custom properties del tema activo en `:root`, permitiendo cambiar de tema sin recargar y añadir temas nuevos sumando entradas al diccionario `TEMAS`.
- `style.css`: variables de marca renombradas de `--barbie-*` a `--brand-*` (genéricas), con valores por defecto del tema actual. Los temas las sobrescriben desde JS sin tocar la hoja de estilos.
- `scripts/generar-assets-negocio.mjs`: regenera `index.html`, `404.html` y `public/manifest.json` con el nombre del negocio activo al hacer build.
- Pantalla de login, header, footer, About, tickets y paneles usan `BUSINESS.nombre` en lugar de "Evolet Studio" hardcodeado.
- Bump de `CACHE_VERSION` en `public/sw.js` (v35 → v36) para forzar la actualización del service worker en clientes instalados.

### Commits
- bdeeb7a feat(white-label): negocio y tema configurables para portear a otros salones (SW v35 → v36)

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
