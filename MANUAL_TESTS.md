# Tests manuales

Checklist para validar los flujos principales de Evolet Nails antes y despues de cada cambio importante.

## Instrucciones de uso

1. Ejecutar `npm run dev` y abrir la URL local.
2. Usar una cuenta de prueba y registros de prueba.
3. Completar cada caso en orden, sin marcar una casilla si no se verifico manualmente.
4. Recargar la seccion despues de guardar para comprobar que el dato persiste.
5. Revisar la consola del navegador despues de cada operacion.
6. Anotar cualquier problema en la tabla de resultados con fecha y pasos para reproducirlo.
7. Corregir el problema y repetir el caso completo, no solo el paso que fallo.
8. Marcar el caso como terminado cuando todos sus resultados esperados se cumplan.

Los tests deben ejecutarse con datos de prueba. No eliminar ni modificar registros reales para completar esta lista.

## Estado de implementacion

- [x] Capa comun para lecturas de clientes, turnos, servicios, gastos y caja.
- [x] Capa comun para pagos, señas, cobros y finalizacion de turnos.
- [x] Capa comun para crear y editar clientes.
- [x] Capa comun para crear, reservar, reagendar y cancelar turnos del Calendario.
- [x] Capa comun para gastos y movimientos de caja.
- [x] Fuentes legacy archivadas fuera del bundle; `CalendarBoard.jsx` es el unico tablero montado.
- [ ] Ejecutar los casos de prueba manuales de este documento.

## Preparacion

- [ ] Iniciar la aplicacion con `npm run dev`.
- [ ] Iniciar sesion con una cuenta de prueba.
- [ ] Confirmar que la cuenta tenga permisos para crear y editar datos.
- [ ] Abrir la consola del navegador para detectar errores inesperados.
- [ ] Usar datos de prueba y no registros reales cuando sea posible.

## 1. Cobrar turno reservado

**Objetivo:** confirmar que el servicio, el pago y el turno quedan actualizados.

1. Crear o elegir un turno reservado con seña.
2. Desde Agenda, seleccionar `Cobrar Turno`.
3. Completar el servicio y confirmar el pago.
4. Recargar la Agenda.

Resultado esperado:

- [ ] Se muestra un mensaje de exito.
- [ ] El servicio aparece en Historial.
- [ ] El metodo de pago es correcto.
- [ ] El turno cambia a `Completado`.
- [ ] La seña y el neto se muestran correctamente.
- [ ] No se crean registros duplicados.

## 2. Registrar una seña

**Objetivo:** confirmar que una reserva registra correctamente su seña.

1. Crear un turno provisional.
2. Seleccionar `Cargar seña`.
3. Ingresar una seña valida, por ejemplo `$5.000`.
4. Confirmar la reserva.
5. Recargar la Agenda.

Resultado esperado:

- [ ] Se muestra un mensaje de exito.
- [ ] El turno cambia a `Reservado`.
- [ ] El monto de la seña es correcto.
- [ ] El metodo de pago es correcto.
- [ ] No se crea una seña duplicada.

## 3. Cobrar un fiado

**Objetivo:** confirmar que un pago pendiente se completa correctamente.

1. Abrir Historial de Ventas.
2. Elegir un servicio con estado `Fiado`.
3. Seleccionar `Cobrar`.
4. Confirmar el cobro.
5. Recargar el Historial.

Resultado esperado:

- [ ] Se muestra un mensaje de exito.
- [ ] El servicio deja de figurar como pendiente.
- [ ] El metodo de pago queda actualizado.
- [ ] El turno relacionado queda `Completado`.
- [ ] No se crea un pago duplicado.

## 4. Cobro con vuelto

**Objetivo:** confirmar que el vuelto y el gasto asociado se registran correctamente.

1. Registrar un servicio con metodo `Efectivo`.
2. Ingresar un monto recibido mayor al total.
3. Confirmar el cobro.
4. Revisar Historial y Gastos.

Resultado esperado:

- [ ] El servicio queda registrado.
- [ ] El vuelto es correcto.
- [ ] El gasto de vuelto aparece una sola vez.
- [ ] El metodo del gasto es correcto.
- [ ] Se muestra mensaje de exito o warning explicito.

## 5. Crear una clienta

1. Abrir Clientes.
2. Crear una clienta con nombre y telefono.
3. Confirmar el registro.
4. Recargar la seccion.

Resultado esperado:

- [ ] La clienta aparece en el listado.
- [ ] Nombre y telefono son correctos.
- [ ] No aparece Email ni Notas en la interfaz.
- [ ] No se crean duplicados.

## 6. Editar y eliminar una clienta

- [ ] Abrir la ficha de una clienta.
- [ ] Editar nombre o telefono.
- [ ] Guardar y recargar.
- [ ] Confirmar que el cambio persiste.
- [ ] Eliminar una clienta de prueba.
- [ ] Confirmar que desaparece del listado.

## 7. Crear, reagendar y cancelar un turno

- [ ] Crear un turno provisional.
- [ ] Confirmar que aparece en Agenda.
- [ ] Reagendarlo a otra fecha y hora.
- [ ] Confirmar que se mueve correctamente.
- [ ] Cancelarlo.
- [ ] Confirmar que el estado queda `Cancelado` o que se elimina segun el flujo definido.

## 8. Registrar un gasto

- [ ] Crear un gasto con concepto, categoria, monto y metodo de pago.
- [ ] Confirmar que aparece en Gastos.
- [ ] Recargar la seccion.
- [ ] Confirmar que no se duplica.
- [ ] Confirmar mensaje de exito o error.

## 9. Registrar un movimiento de caja

- [ ] Crear un deposito.
- [ ] Confirmar que aparece en Cajas.
- [ ] Crear un retiro.
- [ ] Confirmar que los saldos se recalculan.
- [ ] Recargar la seccion y verificar persistencia.

## 10. Errores y estados parciales

- [ ] Desconectar la red antes de confirmar una operacion.
- [ ] Confirmar que aparece un mensaje de error visible.
- [ ] Confirmar que no se informa exito cuando la operacion fallo.
- [ ] Confirmar que no se crean duplicados al reintentar.
- [ ] Revisar la consola por errores no controlados.

## Registro de resultados

| Fecha | Test | Resultado | Incidencia | Corregido |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |
