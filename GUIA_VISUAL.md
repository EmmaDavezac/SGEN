# Guía visual de SGEN

Referencia rápida para mantener una interfaz consistente en Evolet Studio y futuras instalaciones.

## Principios

- Usar clases compartidas antes de crear estilos específicos de una pantalla.
- Mantener una jerarquía clara: una acción principal por bloque y acciones secundarias agrupadas.
- Conservar tamaños estables en botones, campos, tarjetas y modales para evitar saltos de layout.
- Todo control interactivo debe tener foco visible, etiqueta comprensible y estado deshabilitado.
- Los estilos dinámicos solo deben utilizarse para valores calculados por datos, como porcentajes o colores de estado.

## Tokens

Los tokens globales viven en `style.css` dentro de `:root`:

- `--barbie-pink` y `--barbie-dark`: acciones principales y títulos.
- `--barbie-pale` y `--barbie-light`: fondos suaves, bordes y estados seleccionados.
- `--text-color`, `--text-muted` y `--text-light`: jerarquía tipográfica.
- `--white` y `--cream-bg`: superficies y fondo general.
- `--color-danger` y `--color-focus`: estados de error/peligro y foco accesible.
- `--shadow-md`, `--shadow-inset` y `--shadow-focus`: única escala de sombras, en
  tono neutro (marrón chocolate). Ninguna sombra lleva rosa.
- `--border-neutral`: borde neutro de fichas y superficies elevadas.
- `--radius-sm`, `--radius-md` y `--radius-lg`: radios permitidos.
- `--transition`: transición global.

No introducir colores nuevos para un patrón ya cubierto por un token.

## Botones

- `.btn.btn-primary`: acción principal, por ejemplo Guardar, Registrar o Confirmar.
- `.btn.btn-secondary`: cancelar, volver o acción secundaria.
- `.btn.btn-danger`: eliminación o acción destructiva.
- `.btn.btn-block`: acción de ancho completo en formularios.
- `.btn.btn-back`: navegación hacia atrás. En todas las pantallas va **primero, a la
  izquierda** de la cabecera (patrón `.section-title-with-back`): el título y su
  subtítulo siguen a su derecha y las acciones restantes, si las hay, quedan al fondo
  de la fila. La tecla **Esc** y el botón **atrás** del navegador/móvil **aprietan**
  el `Volver` visible de la pantalla; si no hay ninguno, Esc y atrás llevan a la
  pestaña principal (Agenda), con la confirmación del guard si hay un formulario
  abierto (`src/backNavigation.js`, `src/formGuard.js`).
- No existen botones `Cerrar` para salir de una vista: toda acción de volver hacia
  atrás se llama **`Volver`** con icono `fa-arrow-left`, incluidos los toggles de los
  paneles (`Nuevo` al cerrar el formulario, `Volver` a la izquierda al abrirlo). El
  único `Cerrar` válido de la app es `Cerrar sesión`.
- `.btn.btn-sm`: acción compacta en encabezados y paneles.
- Para operaciones asíncronas usar `Button` con `busy`, no texto y `disabled` duplicados.
- Las confirmaciones deben colocar Cancelar a la izquierda y Confirmar a la derecha, con iconos X y check.

## Formularios

- Usar `.cute-form`, `.form-group`, `.input-wrapper` y `.form-row-2`.
- Cada bloque de formulario vive en una card `.chart-section` con un `h4` (icono
  `.panel-heading-icon`): Gastos, Cajas, Agenda, Ajustes y Mi cuenta (bloques
  Perfil y Contraseña) usan ese mismo contenedor.
- Cada campo debe tener `label` asociado mediante `htmlFor`/`id`.
- Usar `type`, `inputMode`, `min`, `max` y `required` según corresponda.
- Todo campo de entrada manual debe avisar en su `label` si es obligatorio u opcional: `<span className="field-required">(obligatorio)</span>` o `<span className="field-optional">(opcional)</span>`.
- Todo `input` de texto, email, teléfono, contraseña o número debe tener un `placeholder` de ejemplo con el formato `Ej. ...` (por ejemplo, `Ej. Camila Silva`, `ejemplo@correo.com`, `Ej. 11 2233 4455`, `Ej. 15000`).
- Excepciones justificadas: los `select` y grupos de `radio` con una opción válida preseleccionada no llevan indicador ni placeholder; los `input` `date`/`time` usan el selector nativo y no muestran placeholder; los campos de solo lectura (email, creado, estado) muestran el dato guardado y no llevan indicador; los buscadores usan placeholder descriptivo sin indicador de obligatoriedad.
- Para altas que no se usan continuamente, abrir el formulario bajo demanda con `aria-expanded` y `aria-controls`.
- Al guardar correctamente, limpiar el formulario y cerrar su panel de alta.
- Los cambios en formularios de edición deben bloquear la salida o pedir confirmación antes de descartarse.
- Los formularios de alta no llevan `Cancelar`: la salida hacia atrás es el `Volver` de la cabecera (toggles `Nuevo`/`Volver`). En móvil, el botón de alta ocupa **toda la fila** (`.form-actions`); en las ediciones, `Guardar` y `Cancelar` ocupan **media fila cada uno** (`.detail-form-actions`, en las fichas y en Mi cuenta).
- **Todas las altas usan el mismo nombre de botón**: `Guardar` (icono disquete, texto visible también en móvil vía `iconOnlyOnMobile={false}`); el `Volver` sigue siendo solo icono en móvil (`.mobile-icon-only`). Las ediciones conservan su nombre específico (`Guardar cambios`, `Guardar servicio`, …) con comportamiento móvil previo.

## Modales

- Usar `Modal` para formularios y `ConfirmModal` para decisiones destructivas o sensibles.
- Mantener título, contenido y acciones en la misma estructura.
- No cerrar por fondo cuando existe una operación en curso.
- Las acciones deben respetar el orden Cancelar / Confirmar.
- Al abrirse, el modal enfoca el primer control interactivo y mantiene el foco dentro de sus límites.
- Al cerrarse, el foco vuelve al control que abrió el modal.

## Escrituras con overlay de progreso

Toda operación de escritura remota (Supabase o Google Calendar) debe pasar por el overlay bloqueante unificado, para que la persona vea siempre en qué paso va y no pueda reenviar el formulario mientras el request está en curso.

- **Multi-paso → `runTask({ title, steps })`** (prop que `App.jsx` pasa a los paneles). Cada step es `{ label, run }`; `runTask` muestra el overlay, marca cada paso (pendiente / girando / check / ✗) y re-lanza el error al caller para que su `catch` muestre el toast original. La referencia es `src/progressTask.js` (`createSteps`, `runSteps`) y el componente `src/components/WriteProgressOverlay.jsx` (bloque `.write-progress-*` en `style.css`).
- **Un solo paso → `showLoader(true, 'texto…')` / `showLoader(false)`** envolviendo el `await`, siempre con el `setSaving*` local en `finally` como guard de botones.
- El overlay es **solo visual**: nunca descarta datos ni toca el estado de los formularios; si el paso falla, la información cargada se conserva.
- Los pasos best-effort (por ejemplo sincronizar con Google Calendar después de guardar en la base) se envuelven en `try/catch` **dentro** del step, para que un error de red no aborte un task que ya cumplió su objetivo principal; el fallo se avisa por toast sin revertir lo guardado.
- Un step puede relanzar `Error` con un mensaje custom (permisos RLS, foreign key, registro inexistente): el `catch` externo lo muestra tal cual.
- No debe existir ningún `setSavingX` como única protección de una escritura remota: o bien abre el overlay (`runTask`), o bien lo acompaña `showLoader`.
- **Jerarquía de capas**: `.loader-overlay` (overlay de progreso) va en `z-index: 150000`, por encima de `.modal-overlay` (`100000`), porque los `ConfirmModal` de eliminación permanecen abiertos con `busy` mientras corre la operación y, con el overlay debajo, no se veía la animación. El overlay se monta por portal en `document.body` (igual que `Modal`), para que ambas capas compitan en el mismo stacking context. El toast va en `200000` (CSS y el style inline de `Toast.jsx`) para que los avisos best-effort se vean por encima del overlay.
- **PWA / service worker**: `index.html` y `404.html` quedan fuera del precache (`globIgnores` en `vite.config.js`); las navegaciones son siempre network-first (ver `public/sw.js`). Si el HTML estuviera precacheado, workbox lo serviría cache-first y un rebuild no llegaría al navegador hasta actualizar el SW: la UI se quedaría con la versión vieja (p. ej. con el overlay tapado bajo los modales). Al versionar un cambio de UI, subir `CACHE_VERSION` en `public/sw.js`.
- `CalendarBoard.syncAppointmentToGoogle` invocado desde la tarjeta (`sincronizar`) se abre con `showLoader(true, 'Sincronizando con Google Calendar…')` y conserva además su feedback local (`syncingAppointmentId`, icono girando). Los usos internos que ya corren dentro de un `runTask` (cancelar, eliminar) no lo envuelven de nuevo: ya están cubiertos por el overlay del task.

## Listados y estados

- Usar tarjetas y listados existentes antes de inventar una nueva variante.
- Todo listado debe contemplar carga, vacío y error.
- Los estados de negocio deben usar badges o clases semánticas, no estilos inline repetidos.
- Las barras de progreso pueden conservar `width` inline cuando el valor provenga de datos.
- **Toda tarjeta de listado comparte el mismo aspecto** (bloque `.expense-card` / `.client-card` / `.history-card` / `.user-card`): fondo blanco, borde 2px `--barbie-pale`, `radius-sm`, **sin sombra**, `padding: 12px` y `gap: 10px`. Ningún contenedor de listado lleva fondo propio: el fondo es el de la página. Las secciones en `.panel-stack` compensan el `margin-top` de búsqueda→listado a `-6px` (`#tab-gastos`, `#tab-historial`, `#tab-usuarios`) para que el total siga siendo 16px. Las KPI de Estadísticas (`#tab-estadisticas .stat-card`) usan esa misma superficie (blanco, borde `--barbie-pale`, `radius-sm`, sin sombra); el degradado `.pink-glow` solo se conserva en Cajas. La nota informativa de Ajustes (`#tab-ajustes .card-info-box`) comparte esa misma superficie.
- **Las acciones de tarjeta van alineadas a la derecha, en todos los listados** (`.card-actions-col`, `.client-actions-col`, `.user-card-actions`, `.appointment-actions-col`): es la posición única del bloque de botones en toda la app.
- **Una tarjeta con muchas acciones no gana altura con una segunda fila**: en turnos (`.appointment-card--stacked`) las acciones van en su propia columna derecha, y lo que evita que se coma el nombre es pisar el piso de la pista de info con `minmax(160px, 1fr)` (la pista `auto` de acciones toma su max-content —hasta ~600px con seis pastillas— y una `1fr` con mínimo `auto` colapsaba contra ella). En mobile (≤520px, botones solo-icono de 44px) la hora sube sobre el nombre y las acciones se acotan a dos iconos por fila a la derecha: la tarjeta queda de ~88-164px en vez de ~138-188px. Se usa una clase propia en vez de cambiar `.appointment-card` porque Cajas reutiliza esa clase con el monto en la tercera columna.

## Flujo de turnos

Los permisos de cada turno se calculan en una única función pura,
`getAppointmentActions(apt, ctx)` de `src/appointmentActions.js`. Ninguna
pantalla debe volver a comparar estados con strings sueltos: se pide la lista
de acciones y se filtra por `visible`.

Estados: `provisional` → `reservado` (con seña) → `completado`, más `cancelado`.
La normalización (`normalizeTurnoEstado`) trata cualquier valor desconocido como
`cancelado`, nunca como provisional, para que un estado raro no herede las
acciones de un turno activo.

| Acción | Provisional | Reservado | Cobrado | Cancelado |
| --- | --- | --- | --- | --- |
| Consultar (solo lectura) | no | no | sí | sí |
| Confirmar (cargar seña) | sí | no | no | no |
| Reagendar | no | sí, solo si el horario todavía no pasó | no | no |
| Cobrar | no | sí, deshabilitado hasta que pase el horario | no | no |
| Cancelar (con motivo) | no | sí, solo cuando ya pasó el horario | no | no |
| Eliminar | cualquier sesión logueada | solo superadmin | solo superadmin | solo superadmin |
| Sincronizar con Google | solo admin y si falta `eventId` | ídem | ídem | ídem |

Cancelar y eliminar no son lo mismo:

- **Cancelar** deja rastro: el turno pasa a `cancelado`, guarda el motivo
  obligatorio en `turnos.motivo_cancelacion` y **no borra nada**, así que la seña
  y el historial siguen consultables (y la seña se puede devolver).
- **Eliminar** borra la fila y solo aplica a provisionales.

Reglas de presentación:

- Una acción no permitida **no se dibuja**: nunca hay que mostrar un botón que va a fallar.
- Excepción: `Cobrar` en un reservado cuyo horario todavía no pasó se dibuja **deshabilitado**, con el motivo en el `title` (`.card-icon-btn:disabled`), porque es la acción que se va a buscar cuando el turno termine.
- `Reagendar` no existe en provisional: para moverlo hay que cancelarlo y agendarlo de nuevo. Y **desaparece cuando el horario ya pasó**: mover un turno cuya hora llegó sería reescribir el historial. El turno pasado se cierra, no se mueve.
- `Cancelar` no se ofrece en un reservado futuro: mientras haya tiempo, la salida es `Reagendar`. Aparece recién cuando el horario ya pasó (la cliente no vino), porque obliga a cargar un motivo que queda en el historial. Es la contracara de `Cobrar` y `Reagendar`: un reservado pasado solo se puede cerrar (cobrado o cancelado), no mover.
- La restricción de superadmin es solo de interfaz: el borrado real lo autoriza RLS (dueño o admin). Un turno con seña o con servicio cobrado no se puede eliminar porque rompería la integridad referencial (`pagos` y `servicios` tienen FK a `turnos`); en ese caso se avisa y se sugiere reagendar.

### Ficha unificada de venta y turno (`VentaDetalleModal`)

`Consultar` aparece solo cuando el turno ya terminó (cobrado o cancelado): mientras
está activo, el detalle se lee en la propia tarjeta y lo que importa son las
acciones.

Abre `VentaDetalleModal`, la ficha única de detalle. La misma la abre el Historial
(`Consultar` de una venta), la Agenda (`Consultar`) y el historial interno de Clientes,
con el mismo formato y datos. Recibe el servicio y, si existe, el `turnoId`; se carga
al abrir porque consulta `pagos` y `servicios` del turno.

La ficha se presenta según por dónde se abre (prop `as`): **desde el calendario de
turnos es una ventana de pantalla** (`DetailWindow`, `as="window"`): mientras está
abierta, la pestaña Calendario oculta el calendario y el listado del día (solo se ve
la ficha; `Volver` repone la agenda), y el formato es **idéntico al de las otras
fichas**: `Volver` arriba a la izquierda, título y subtítulo a su derecha, secciones en
una sola columna en el cuerpo de la ventana y acciones al pie. El título es
**"Ficha de turno"**.
**Desde el Historial y Clientes sigue siendo modal** (`as="modal"`, el
default), porque ahí el overlay funciona sin desperdiciar espacio. Con `turnoId`
aparece la sección Turno; sin turno (venta histórica sin agenda) la ficha es más
corta: **"Ficha de venta"**, sin sección Turno ni Cancelación. Las secciones se
muestran según lo que haya pasado:

| Sección | Cuándo aparece | Qué muestra |
| --- | --- | --- |
| Turno | solo con `turnoId` | fecha (ej. `10/10/2026`) y hora de inicio en una sola fila, estado con badge |
| Cancelación | solo si el turno está cancelado | el motivo cargado, o "Sin motivo registrado" |
| Servicio realizado | si no está cancelado | cliente (con atajo `Consultar`, icono de ojo, junto al nombre) y qué se hizo; cuándo y quién lo registró **solo para admins** (flag `isAdmin`) |
| Seña | si hay pagos tipo `sena` | monto total, y por cada pago cuándo se pagó y con qué medio |
| Cobro | si hay servicio | precio total, seña descontada, si hubo sobrepago **cuánto entregó** y **cuánto se le devolvió**, método de pago (resuelto desde `servicios` o el último cobro cuando el turno no lo trae) y estado del pago (fiado pendiente/saldado, pago completo o **Pendiente de cobro** si todavía no se cobró) |
| Movimientos del turno | si hay más de un pago | seña, cobro y ajustes en orden cronológico |

Acciones: la cabecera queda **solo con `Volver`** (igual que en las otras ventanas de
ficha); `Compartir comprobante` y `Cobrar` van **al pie** (`.detail-window-footer`),
después de las secciones, en ambos formatos. El subtítulo de la cabecera **describe
el contenido** (como en cliente/usuario): cliente y fecha no se repiten arriba porque
ya están en las secciones ("Cliente", "Fecha y horario" / "Registrado"). En mobile,
`Compartir comprobante` ocupa **toda la fila** con su label visible, vía la clase
reutilizable **`.detail-btn-full-mobile`** (aplicable a cualquier botón del pie de
una ficha; en desktop el botón vuelve a su ancho contenido). El atajo a la ficha de la
cliente (`Consultar`, junto a su nombre, icono de ojo `fa-eye` igual que en las
listas) navega a la pestaña Clientes y
abre el perfil (por evento global
`evolet:abrir-cliente`, módulo `clienteNav.js`); `Compartir comprobante` genera el
ticket en un canvas (`TicketCanvas`): en móvil usa `navigator.share`, en desktop lo
descarga como imagen; y no aparece si la venta está fiada (se muestra `Cobrar` en su
lugar, que llama a `onPay`).

Todas las fichas comparten nombres y clases (`detail-*`): los títulos son
**"Ficha de …"** (cliente, usuario, turno, venta), el atajo de las listas para
abrirlas es siempre **`Consultar`** (Agenda, Historial, Clientes, Usuarios y el
interior de la propia ficha), las secciones de solo lectura usan `detail-block` +
`detail-block-rows` con filas `detail-row`, los formularios editables de cliente y
usuario usan `detail-form` / `detail-fields` / `detail-form-actions`, y todas las
ventanas (`DetailWindow`) dejan la cabecera solo con `Volver` y las acciones en el
pie `detail-window-footer`.

El modal de cancelación aclara que el turno no se borra y que la seña queda a la
vista para devolverla.

## Responsive y accesibilidad

- Diseñar primero para pantallas estrechas y verificar después escritorio.
- En móvil, las grillas de dos columnas deben pasar a una columna cuando el contenido no entre.
- **Ojo con los mínimos de las pistas:** un `minmax(420px, …)` fijo en una grilla de dos columnas puede dejar la otra columna en ~230px en ventanas medianas (900–1200px). Si una columna no entra, apilar en un breakpoint intermedio (`@media (min-width: 900px) and (max-width: 1180px)` en la agenda) en vez de repartir un ancho que no alcanza.
- No depender solo del color para comunicar estados.
- Mantener `:focus-visible` activo y no eliminar el outline sin reemplazo accesible.
- Los botones solo con icono deben tener `title` y `aria-label` cuando el significado no sea obvio.
- Respetar `prefers-reduced-motion` en animaciones decorativas.

## Checklist antes de finalizar una pantalla

- [ ] Reutiliza tokens y clases existentes.
- [ ] No agrega estilos inline salvo valores calculados por datos.
- [ ] Tiene estados de carga, vacío, error y deshabilitado.
- [ ] Puede usarse con teclado y tiene foco visible.
- [ ] Funciona en móvil y escritorio.
- [ ] Ejecuta correctamente `npm run build`.
