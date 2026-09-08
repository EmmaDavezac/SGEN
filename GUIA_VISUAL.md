# Guía visual de SGEN

Referencia rápida para mantener una interfaz consistente en Evolet Nails y futuras instalaciones.

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
- `--radius-sm`, `--radius-md` y `--radius-lg`: radios permitidos.
- `--transition`: transición global.

No introducir colores nuevos para un patrón ya cubierto por un token.

## Botones

- `.btn.btn-primary`: acción principal, por ejemplo Guardar, Registrar o Confirmar.
- `.btn.btn-secondary`: cancelar, volver o acción secundaria.
- `.btn.btn-danger`: eliminación o acción destructiva.
- `.btn.btn-block`: acción de ancho completo en formularios.
- `.btn.btn-back`: navegación hacia atrás.
- `.btn.btn-sm`: acción compacta en encabezados y paneles.
- Para operaciones asíncronas usar `Button` con `busy`, no texto y `disabled` duplicados.
- Las confirmaciones deben colocar Cancelar a la izquierda y Confirmar a la derecha, con iconos X y check.

## Formularios

- Usar `.cute-form`, `.form-group`, `.input-wrapper` y `.form-row-2`.
- Cada campo debe tener `label` asociado mediante `htmlFor`/`id`.
- Usar `type`, `inputMode`, `min`, `max` y `required` según corresponda.
- Para altas que no se usan continuamente, abrir el formulario bajo demanda con `aria-expanded` y `aria-controls`.
- Al guardar correctamente, limpiar el formulario y cerrar su panel de alta.
- Los cambios en formularios de edición deben bloquear la salida o pedir confirmación antes de descartarse.

## Modales

- Usar `Modal` para formularios y `ConfirmModal` para decisiones destructivas o sensibles.
- Mantener título, contenido y acciones en la misma estructura.
- No cerrar por fondo cuando existe una operación en curso.
- Las acciones deben respetar el orden Cancelar / Confirmar.
- Al abrirse, el modal enfoca el primer control interactivo y mantiene el foco dentro de sus límites.
- Al cerrarse, el foco vuelve al control que abrió el modal.

## Listados y estados

- Usar tarjetas y listados existentes antes de inventar una nueva variante.
- Todo listado debe contemplar carga, vacío y error.
- Los estados de negocio deben usar badges o clases semánticas, no estilos inline repetidos.
- Las barras de progreso pueden conservar `width` inline cuando el valor provenga de datos.

## Responsive y accesibilidad

- Diseñar primero para pantallas estrechas y verificar después escritorio.
- En móvil, las grillas de dos columnas deben pasar a una columna cuando el contenido no entre.
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
