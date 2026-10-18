# Changelog — SGEN



## v1.3.14 — 2026-10-18 (SW v61)

### Cambios
- Registrar Servicio: combos del Personalizado (combo de 10 uñas) anchos y legibles en todos los dispositivos: los selects heredaban `max-width: 140px` de `.filter-select` y quedaban angostos; ahora el servicio ocupa todo el ancho restante (`max-width: none`) y la columna de uñas queda fija y angosta (`minmax(88px, 110px)`), con `min-width: 0` para que el grid no los comprima.
- Bump de `CACHE_VERSION` en `public/sw.js` (v60 → v61) para forzar la actualización del service worker en clientes instalados.

### Commits
- 2b8f235 fix(registro): combos del personalizado anchos y legibles en todos los dispositivos (SW v60 → v61)

## v1.3.13 — 2026-10-18 (SW v60)

### Cambios
- Registrar Servicio: el contenedor de reparto del cobro combinado (método "Combinado") ahora responde al modo oscuro: el fondo usa `var(--cream-bg)` en lugar de `var(--soft-bg)` (variable inexistente que siempre caía al rosa claro `#fdf3f8`); el resumen usa `var(--border-neutral)`, y los acentos de pendiente fiado y error usan `var(--color-danger)` en lugar de hex fijos.
- Bump de `CACHE_VERSION` en `public/sw.js` (v59 → v60) para forzar la actualización del service worker en clientes instalados.

### Commits
- 48d19e4 fix(registro): reparto del cobro combinado responde al modo oscuro (SW v59 → v60)

## v1.3.12 — 2026-10-18 (SW v59)

### Cambios
- Registrar Servicio: nuevo toggle "¿Tiene descuento?" (mismo estilo que "¿Tiene retiro previo externo?") con opciones de 10% o 20%, que muestra el monto descontado en cada botón. El sistema calcula el total (base + retiro externo − descuento) y el input "Precio Total" pasa a ser de solo lectura.
- El descuento se registra en `servicios` y aparece en la ficha "Consultar" de turno/venta, sección Cobro: "Descuento aplicado: 10% (−$…)". El modal de confirmación del cobro también muestra la fila "Descuento 10%".
- El descuento no se aplica al Retiro Servicio Propio (su total siempre es $0) y se limpia al registrar un servicio.
- Combos del builder de 10 uñas legibles: selects con fuente 16px (sin auto-zoom en iOS), alto mínimo 44px, padding amplio y labels de 13px; en mobile (≤560px) las dos filas del combo se apilan a ancho completo para que el contenido no se corte.
- **Requiere aplicar la migración `20260823000031_add_servicio_descuento.sql`** (agrega `descuento_pct` y `descuento_monto` a `servicios` con sus checks; la RLS existente alcanza).
- Bump de `CACHE_VERSION` en `public/sw.js` (v58 → v59) para forzar la actualización del service worker en clientes instalados.

### Commits
- c5b777f feat(descuento): toggle 10/20% con precio de solo lectura, detalle en ficha de turno y combo de uñas legible (SW v58 → v59)

## v1.3.11 — 2026-10-18 (SW v58)

### Cambios
- Registrar Servicio: el "Retiro Servicio Propio" admite precio $0, la única excepción a la regla de precio mayor a 0.
- Al elegir Retiro Servicio Propio ya no se pregunta el método de pago y se oculta el input de "Precio Total": el total siempre es $0 (`finalPrice` lo fuerza, sin consultar el catálogo) y aparece el aviso "Retiro del servicio propio: sin cobro y sin método de pago".
- El modal "Cobro en Efectivo" no se abre cuando el neto a cobrar es $0; se confirma directo.
- El modal de confirmación muestra "Sin cobro" cuando el total es $0.
- La seña del payload se limita al total registrado (`min(seña, precio)`) para respetar la restricción `sena <= precio` de la base (caso turno con seña cobrado como retiro propio $0).
- Personalizado (Otro): muestra directamente el builder del combo de 2 servicios / 10 uñas (antes solo ofrecía "Servicio Personalizado" $0); se quitaron el campo de nombre libre, el botón "Armar combinación" y el botón "Elegir servicio" que ya no tienen sentido.
- La combinación de 2 servicios calcula nombre y precio también al cobrar desde un turno (antes los efectos estaban guardados con `!initialAppointment` y no calculaban nada en ese flujo).
- Cambiar de categoría limpia el servicio, nombre y precio elegidos, evitando arrastrar un servicio viejo (p. ej. un retiro propio $0) a otra categoría al cobrar un turno.
- Inputs numéricos (montos, precios, cantidades) sin flechas incrementales en toda la app; la regla que aplicaba solo en la sección Precios ahora es global (`public/style.css`).
- Bump de `CACHE_VERSION` en `public/sw.js` (v55 → v58) para forzar la actualización del service worker en clientes instalados.

### Commits
- 663ceeb fix(registro): retiro propio $0 sin metodo de pago y personalizado con nombre libre (SW v55 → v56)
- cff3c33 fix(registro): personalizado es directamente el combo de 10 uñas y inputs monto sin flechas (SW v56 → v57)
- 080d0e8 fix(registro): retiro propio oculta el input de precio porque siempre es $0 (SW v57 → v58)

## v1.3.10 — 2026-10-15 (SW v55)

### Cambios
- Loader de "Verificando credenciales": `.loader-overlay` ahora usa `var(--surface-bg)` en lugar de `rgba(252, 249, 245, 0.9)` hardcodeado, así el fondo del overlay es oscuro en modo oscuro en lugar de quedar blanco con texto blanco.
- Botón "Cobrar" de las tarjetas de deudores (panel Estadísticas): pasa de `variant="success"` a `variant="primary"` para que sea la acción principal visible y coherente con el resto de la app.
- Bump de `CACHE_VERSION` en `public/sw.js` (v54 → v55) para forzar la actualización del service worker en clientes instalados.

### Commits
- 80f2c4c fix(ui): loader respeta modo oscuro y boton cobrar deudores es primary (SW v54 → v55)
## v1.3.9 — 2026-10-15 (SW v54)

### Cambios
- Splash screen de la PWA en modo oscuro: `public/manifest-dark.json` ahora define `background_color: #1a141a` para que el fondo del splash sea oscuro en lugar de blanco (antes, sin `background_color`, Android usaba blanco por defecto).
- `index.html`: script temprano en `<head>` que ajusta el manifiesto y el `theme-color` según `prefers-color-scheme: dark` antes de cargar React, evitando el flash de barra rosa y el splash blanco al abrir la PWA.
- Barra de direcciones de Android y PWA instalada: `theme-color` y `theme_color` del manifiesto oscuro en `#1a141a` en modo oscuro.
- Bump de `CACHE_VERSION` en `public/sw.js` (v53 → v54) para forzar la actualización del service worker en clientes instalados.

### Commits
- 4782a38 fix(pwa): fondo oscuro en splash y theme-color en modo oscuro (SW v53 → v54)
## v1.3.8 — 2026-10-15 (SW v53)

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
- `theme-color` dinámico por modo: en modo claro usa `--brand-primary` (rosa); en modo oscuro usa `--surface-bg` para que la barra de direcciones de Android y la PWA instalada se mezcle con el fondo oscuro en lugar de forzar rosa en ambos temas.
- iOS status bar style: `black` en modo oscuro, `default` en modo claro.
- Manifest de PWA dinámico: se agregó `public/manifest-dark.json` con colores oscuros y el `<link rel="manifest">` ahora cambia vía JS entre `/manifest.json` (claro) y `/manifest-dark.json` (oscuro) al alternar el tema, así el splash screen y la barra de direcciones de la PWA instalada respetan el modo activo.
- Barra inferior de Android (`.app-nav`) y tarjeta de login (`.login-card`) ahora usan `var(--brand-primary)` para el borde en lugar de `var(--brand-pale)`, que en modo oscuro era igual al fondo y se volvía invisible.
- Bump de `CACHE_VERSION` en `public/sw.js` (v51 → v52) para forzar la actualización del service worker en clientes instalados.
- Se agregó `data-theme="oscuro"` al `<html>` desde `theme.js` para forzar colores oscuros con mayor especificidad en `.app-nav` y `.login-screen` cuando el SW sirve CSS cacheado.
- `[data-theme="oscuro"] .app-nav` fuerza `background: #1a141a !important` y `border-color: #FF69B4 !important` para que la barra inferior de Android sea visible en modo oscuro.
- `[data-theme="oscuro"] .login-screen` fuerza gradiente oscuro (`#121016` → `#1a141a`) `!important` para que la pantalla de login responda al modo oscuro.
- Se quitó `background_color` de `public/manifest-dark.json` para que el splash screen de la PWA instalada no force un color blanco.
- Bump de `CACHE_VERSION` en `public/sw.js` (v52 → v53) para forzar la actualización del service worker en clientes instalados.

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
- 3c77eea fix(theme-color): theme-color por modo oscuro y barra de direcciones PWA (SW v50 → v51)
- 7bb09c0 fix(pwa): manifest oscuro, login-card y app-nav borde visible en modo oscuro (SW v51 → v52)
- b1800a2 fix(pwa): forzar modo oscuro en app-nav, login-screen y splash screen (SW v52 → v53)

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
