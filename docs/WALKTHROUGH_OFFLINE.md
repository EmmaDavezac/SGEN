# Guía de Prueba y Validación: Soporte Offline en SGEN

> Este documento detalla el procedimiento paso a paso para probar, verificar y auditar las capacidades sin conexión (offline-first) de SGEN en entornos locales y de producción.

---

## Requisitos Previos

1. Navegador web moderno con soporte para Service Workers e IndexedDB (Chrome, Edge, Firefox o Safari 15+).
2. Servidor de desarrollo corriendo (`npm run dev`) o build de producción probado localmente (`npm run preview`).
3. Sesión activa en la aplicación (haber iniciado sesión con un usuario válido al menos una vez mientras había conexión).

---

## Herramientas de DevTools para la Prueba

1. **Pestaña Network (Red)**:
   - Cambiar el selector de velocidad de `No throttling` a **`Offline`**.
2. **Pestaña Application (Aplicación)**:
   - Sección **Storage**:
     - **Service Workers**: verificar que el Service Worker esté activo y en ejecución.
     - **IndexedDB**: inspeccionar la base de datos `sgen_offline_db` y sus almacenes (`clientes`, `turnos`, `servicios`, `precios`, `gastos`, `sync_queue`).

---

## Escenarios de Validación Paso a Paso

### Escenario 1: Resiliencia de Sesión sin Red
**Objetivo**: Comprobar que la app no expulsa al usuario al login si se abre sin internet.

1. Iniciar sesión normalmente en la app con conexión.
2. Abrir DevTools (`F12`), ir a **Network** y marcar el checkbox o seleccionar **`Offline`**.
3. Recargar la página (`Ctrl + R` o `F5`).
4. **Resultado esperado**:
   - La aplicación carga desde el caché del Service Worker.
   - La sesión se mantiene abierta (no aparece la pantalla de login).
   - Se visualiza el indicador superior: `Sin conexión (modo offline)`.

---

### Escenario 2: Consulta de Datos en Modo Offline
**Objetivo**: Verificar que los listados y datos clave estén disponibles sin conexión gracias a IndexedDB.

1. Con la aplicación en modo `Offline`:
   - Ir a la pestaña **Clientes**: verificar que el listado de clientas guardadas se muestre con sus datos y teléfonos.
   - Ir a la pestaña **Precios**: verificar que los servicios y precios estén visibles.
   - Ir a la pestaña **Gastos**: verificar el historial de egresos previos.
   - Ir a la pestaña **Estadísticas**: verificar el cálculo de ingresos y balances con los datos locales.
2. **Resultado esperado**:
   - No aparecen errores de red ni alertas rojas de fallo de conexión.
   - Los datos se leen inmediatamente de IndexedDB.

---

### Escenario 3: Registro de Operaciones Offline (Optimistic UI)
**Objetivo**: Crear registros sin conexión y verificar que se encolen.

1. Mantener el modo `Offline` activo en DevTools.
2. Ir a la pestaña **Gastos** y hacer clic en **Registrar egreso**.
3. Ingresar un concepto (ej. `Insumos uñas`) y un monto (ej. `1500`), método de pago y guardar.
4. **Resultado esperado**:
   - El gasto aparece inmediatamente en la lista de gastos.
   - La notificación informa: `Guardado localmente. Se sincronizará al recuperar conexión.`.
   - El indicador superior se actualiza: `Modo offline · 1 cambio pendiente`.
5. En DevTools > **Application** > **IndexedDB** > `sgen_offline_db` > `sync_queue`:
   - Se observa el registro encolado con su tipo (`saveExpense`), fecha y payload.

---

### Escenario 4: Sincronización Automática al Reconectar
**Objetivo**: Validar el vaciado de la cola y la persistencia final en Supabase.

1. En la pestaña **Network** de DevTools, cambiar de `Offline` a **`No throttling`** (o volver a habilitar el Wi-Fi).
2. Observar la barra superior de la app.
3. **Resultado esperado**:
   - El navegador dispara el evento `online`.
   - El indicador muestra: `Sincronizando cambios pendientes...`.
   - Las operaciones de `sync_queue` se envían a Supabase en orden cronológico.
   - Al finalizar, el indicador cambia a: `Todo sincronizado` y desaparece tras unos segundos.
   - La tabla `sync_queue` en IndexedDB queda vacía (`0` registros).
   - En Supabase (o recargando con red), el gasto registrado offline existe con su identificador final en la base de datos remota.

