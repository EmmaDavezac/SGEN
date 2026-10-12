# Correcciones y mejoras futuras

Hoja de ruta para convertir SGEN en una aplicación consistente, mantenible y portable a otros salones. Cada tarea debe implementarse respetando los permisos por rol, la accesibilidad, el diseño responsive y las políticas RLS de Supabase.

## Prioridad 1: consistencia visual y experiencia de uso

- [ ] Completar los tokens globales en `style.css` para colores, tipografías, espaciado, bordes, sombras y estados (`hover`, `focus`, `disabled`, `error`). Preparar los tokens para un futuro modo oscuro. Ya existen tokens base y estados de foco, carga y peligro.
- [x] Crear una guía visual breve con los componentes y variantes permitidas: botones, campos, selects, tablas/listados, badges, alertas, modales y estados vacíos. Ver `GUIA_VISUAL.md`.
- [ ] Unificar los botones de acción principal: guardar, registrar y actualizar deben compartir tamaño, jerarquía, iconografía y estados de carga.
- [x] Unificar los botones de confirmación: `Cancelar` siempre a la izquierda y `Confirmar` siempre a la derecha, con iconos de cerrar y verificar, respectivamente.
- [ ] Unificar los botones `Volver`: ya se unificó **tamaño** (`.btn-primary .btn-sm .panel-header-action .btn-back .mobile-icon-only`, igual que las demás acciones de cabecera) y **ubicación** (siempre primero y a la izquierda de la cabecera, patrón `.section-title-with-back` en Historial, Precios, Registrar Servicio, Mi cuenta y las fichas; el título queda a su derecha). Falta el **comportamiento**: mientras exista un formulario con cambios sin guardar, debe bloquearse la navegación o solicitar confirmación.
- [ ] Homogeneizar formularios, buscadores y listados para que compartan ancho, espaciado, etiquetas, validaciones y mensajes de error. Ya se unificó el marcador de campos obligatorios/opcionales y los placeholders de ejemplo en todos los formularios.
- [x] Proteger el inicio de sesión con rate limit en el cliente: 5 intentos fallidos dentro de 15 minutos bloquean el ingreso durante 5 minutos, con cuenta regresiva, botón deshabilitado y aviso en pantalla (`src/loginRateLimit.js`). Los intentos fallidos de Supabase cuentan; los fallos de red no. Se limpia al ingresar correctamente. La protección real sigue siendo del servidor (Supabase Auth aplica límites propios y RLS sigue autorizando).
- [x] Unificar el indicador de campo obligatorio y el placeholder en todos los formularios: `field-required`/`field-optional` en los `label` y placeholders de ejemplo (`Ej. ...`) en los `input`. Reglas y excepciones documentadas en `GUIA_VISUAL.md`.
- [ ] Normalizar el tamaño, encabezado, pie y comportamiento responsive de los modales.
- [x] Eliminar estilos inline y centralizar los estilos de la aplicación en el sistema CSS global, manteniendo las excepciones justificadas y documentadas. Los estilos restantes son únicamente valores dinámicos de datos (`width` de barras y color de estado).
- [ ] Usar un único componente de carga para toda la aplicación, con una sola fuente de configuración para cambiar su animación.
- [ ] Revisar contraste, foco visible, navegación por teclado, textos de botones y etiquetas para cumplir buenas prácticas de accesibilidad. Ya se añadió soporte global para `prefers-reduced-motion`, etiquetas ARIA en acciones del calendario y gestión de foco en modales.

## Prioridad 2: flujos y funcionalidades

- [x] Hacer que los formularios de alta se abran bajo demanda y se cierren al completar o cancelar la operación, conservando el contexto de la sección. Gastos, Clientes, Cajas y Agenda de Turnos ya fueron migrados (Agenda pasó de modal a formulario inline con el patrón `.chart-section` + `.form-group` + `.form-actions`) y todos protegen el descarte de cambios sin guardar.
- [x] Añadir una acción de WhatsApp en la ficha de cada clienta que tenga teléfono. Validar y normalizar el número antes de generar el enlace.
- [ ] Proteger la salida de formularios en edición: detectar cambios sin guardar y ofrecer `Continuar editando` o `Descartar cambios`. Ya está cubierto en Clientas, Precios, creación de turnos, alta de Clientes, alta de Gastos, Cajas, Registro de Servicio, cobro en efectivo, seña, reagendar y pagos pendientes.
- [x] Implementar recuperación de contraseña con Supabase Auth y enlaces temporales. No almacenar contraseñas, contraseñas de aplicación ni credenciales de correo en el frontend.
- [x] Definir y aplicar el flujo de estados de los turnos: un provisional solo se confirma (seña) o se elimina; un reservado se puede cobrar (cuando ya pasó el horario), reagendar o eliminar (solo superadmin); un cobrado y un cancelado son de solo lectura y solo el superadmin puede borrarlos. La matriz vive en `getAppointmentActions` (`src/appointmentActions.js`) y se documenta en `GUIA_VISUAL.md`. **Requiere aplicar la migración `20260823000027_add_turno_cancel_reason.sql`** (agrega `turnos.motivo_cancelacion`; la RLS de update ya existente alcanza). De paso se corrigió que un turno `cancelado` se mostrara y tratara como provisional.
- [x] Diferenciar cancelar de eliminar: cancelar queda en el historial con su motivo obligatorio y no borra nada (la seña sigue consultable para devolverla); eliminar borra la fila y solo aplica a provisionales. La acción `Cancelar` aparece en un reservado recién cuando el horario ya pasó, y `Consultar` abre una ficha de solo lectura con toda la información del turno (`pagos` y `servicios`): seña, cuándo y con qué medio se pagó, qué servicio se hizo, quién lo registró, cómo se cobró y el motivo de la cancelación.
- [x] Añadir un módulo de gestión de usuarios visible solo para administradores: invitación, rol, activación/desactivación y recuperación de contraseña. Requiere desplegar las Edge Functions `invite-user` y `manage-user` con `SUPABASE_SERVICE_ROLE_KEY` configurada.
- [ ] Mantener el módulo de usuarios protegido en la interfaz, en las funciones y mediante políticas RLS; ocultar una opción no reemplaza la autorización del servidor.

## Prioridad 3: modelo de producto portable

- [ ] Reemplazar el panel de precios por un catálogo de servicios con categorías configurables, precio, duración, estado activo e historial de cambios.
- [ ] Separar la configuración específica de Evolet Nails de la lógica del producto: nombre, moneda, categorías, métodos de pago, permisos y textos configurables.
- [ ] Definir una configuración inicial por negocio para facilitar la creación de nuevas instalaciones sin duplicar código.
- [ ] Documentar las reglas de negocio, el esquema de datos, las variables de entorno y el procedimiento de despliegue.
- [ ] Agregar auditoría para operaciones sensibles: cambios de precios, usuarios, pagos, gastos y eliminaciones lógicas.

## Prioridad 4: calidad técnica

- [ ] Migrar gradualmente JSX a TypeScript empezando por modelos de datos, llamadas a la API, formularios y componentes compartidos.
- [ ] Activar verificación de tipos estricta y evitar `any` salvo integraciones externas justificadas.
- [ ] Agregar pruebas para cálculos de pagos, señas, vuelto, estados de turnos, permisos y validaciones de formularios.
- [ ] Agregar una comprobación de build y pruebas automatizadas al flujo de integración continua.
- [ ] Verificar la aplicación en móvil y escritorio después de cada cambio visual importante, incluyendo estados de carga, error, vacío y datos extensos.

## Criterios de aceptación

Una mejora se considera terminada cuando:

1. Mantiene el diseño y los estados definidos en la guía visual.
2. Funciona correctamente en móvil y escritorio.
3. No permite saltarse permisos mediante llamadas directas a la API.
4. Incluye validación y manejo de errores comprensible para la persona usuaria.
5. No introduce estilos duplicados ni lógica específica de un negocio en componentes reutilizables.
6. Pasa `npm run build` y las pruebas relacionadas con el cambio.

## Orden recomendado de implementación

1. Tokens CSS y componentes compartidos.
2. Formularios, modales, botones y navegación protegida.
3. Recuperación de contraseña y gestión segura de usuarios.
4. Catálogo configurable de servicios y preparación multi-negocio.
5. Migración gradual a TypeScript, pruebas y automatización de calidad.