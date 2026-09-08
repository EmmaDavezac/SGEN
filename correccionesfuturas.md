# Correcciones y mejoras futuras

Hoja de ruta para convertir SGEN en una aplicación consistente, mantenible y portable a otros salones. Cada tarea debe implementarse respetando los permisos por rol, la accesibilidad, el diseño responsive y las políticas RLS de Supabase.

## Prioridad 1: consistencia visual y experiencia de uso

- [ ] Completar los tokens globales en `style.css` para colores, tipografías, espaciado, bordes, sombras y estados (`hover`, `focus`, `disabled`, `error`). Preparar los tokens para un futuro modo oscuro. Ya existen tokens base y estados de foco, carga y peligro.
- [x] Crear una guía visual breve con los componentes y variantes permitidas: botones, campos, selects, tablas/listados, badges, alertas, modales y estados vacíos. Ver `GUIA_VISUAL.md`.
- [ ] Unificar los botones de acción principal: guardar, registrar y actualizar deben compartir tamaño, jerarquía, iconografía y estados de carga.
- [x] Unificar los botones de confirmación: `Cancelar` siempre a la izquierda y `Confirmar` siempre a la derecha, con iconos de cerrar y verificar, respectivamente.
- [ ] Unificar los botones `Volver` en tamaño, ubicación y comportamiento. Mientras exista un formulario con cambios sin guardar, debe bloquearse la navegación o solicitar confirmación.
- [ ] Homogeneizar formularios, buscadores y listados para que compartan ancho, espaciado, etiquetas, validaciones y mensajes de error.
- [ ] Normalizar el tamaño, encabezado, pie y comportamiento responsive de los modales.
- [x] Eliminar estilos inline y centralizar los estilos de la aplicación en el sistema CSS global, manteniendo las excepciones justificadas y documentadas. Los estilos restantes son únicamente valores dinámicos de datos (`width` de barras y color de estado).
- [ ] Usar un único componente de carga para toda la aplicación, con una sola fuente de configuración para cambiar su animación.
- [ ] Revisar contraste, foco visible, navegación por teclado, textos de botones y etiquetas para cumplir buenas prácticas de accesibilidad. Ya se añadió soporte global para `prefers-reduced-motion`, etiquetas ARIA en acciones del calendario y gestión de foco en modales.

## Prioridad 2: flujos y funcionalidades

- [ ] Hacer que los formularios de alta se abran bajo demanda y se cierren al completar o cancelar la operación, conservando el contexto de la sección. Gastos, Clientes y Cajas ya fueron migrados y protegen el descarte.
- [x] Añadir una acción de WhatsApp en la ficha de cada clienta que tenga teléfono. Validar y normalizar el número antes de generar el enlace.
- [ ] Proteger la salida de formularios en edición: detectar cambios sin guardar y ofrecer `Continuar editando` o `Descartar cambios`. Ya está cubierto en Clientas, Precios, creación de turnos, alta de Clientes, alta de Gastos, Cajas, Registro de Servicio, cobro en efectivo, seña, reagendar y pagos pendientes.
- [x] Implementar recuperación de contraseña con Supabase Auth y enlaces temporales. No almacenar contraseñas, contraseñas de aplicación ni credenciales de correo en el frontend.
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