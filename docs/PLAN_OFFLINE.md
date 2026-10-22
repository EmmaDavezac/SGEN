# Plan de Implementación: Soporte Offline para SGEN (Evolet Studio)

> **Documento de Arquitectura y Hoja de Ruta**  
> Fecha de creación: 22 de Octubre de 2026  
> Estado: Aprobado para ejecución  
> Rama base: `dev`

---

## 1. Visión y Objetivos

Permitir que la aplicación de Evolet Studio continúe operando de manera fluida y confiable en situaciones donde la conexión a internet sea inestable, lenta o nula (cortes de luz, problemas de ISP, trabajo en zonas con poca señal).

### Objetivos Principales:
1. **Disponibilidad Continua**: La app debe abrirse y permitir navegación sin cerrar la sesión ni bloquear la interfaz si no hay conexión.
2. **Lectura Ininterrumpida**: Poder consultar clientes, agenda de turnos del día, catálogo de precios, historial de servicios y gastos usando una base local en el dispositivo.
3. **Escritura y Cobro Offline**: Permitir registrar servicios, cobrar turnos, agendar citas y asentar gastos aun sin red, guardándolos localmente con respuesta inmediata en la UI (*optimistic UI*).
4. **Sincronización Automática y Segura**: En cuanto se recupere la conexión (`online`), una cola de sincronización en segundo plano enviará las operaciones a Supabase en estricto orden cronológico, resolviendo identificadores y actualizando el estado.
5. **Transparencia Visual**: La persona usuaria siempre debe saber en qué estado de conexión se encuentra y cuántas operaciones están pendientes de sincronizar, sin emojis y respetando la guía visual del sistema.

---

## 2. Estrategia de Ramas en Git

Para proteger la rama principal (`feature/migrate-to-supabase`), se establece la siguiente jerarquía de trabajo:

```mermaid
gitGraph
   commit id: "Base actual"
   branch dev
   checkout dev
   commit id: "Inicio dev"
   branch feature/offline-etapa1-sesion-indicador
   checkout feature/offline-etapa1-sesion-indicador
   commit id: "Etapa 1: Sesión e indicador"
   checkout dev
   merge feature/offline-etapa1-sesion-indicador
   branch feature/offline-etapa2-indexeddb-lecturas
   checkout feature/offline-etapa2-indexeddb-lecturas
   commit id: "Etapa 2: IndexedDB y lecturas"
   checkout dev
   merge feature/offline-etapa2-indexeddb-lecturas
   branch feature/offline-etapa3-cola-sincronizacion
   checkout feature/offline-etapa3-cola-sincronizacion
   commit id: "Etapa 3: Cola y escrituras"
   checkout dev
   merge feature/offline-etapa3-cola-sincronizacion
   branch feature/offline-etapa4-docs-pruebas
   checkout feature/offline-etapa4-docs-pruebas
   commit id: "Etapa 4: Walkthrough y README"
   checkout dev
   merge feature/offline-etapa4-docs-pruebas
   checkout feature/migrate-to-supabase
   merge dev
```

1. **`dev`**: Rama integradora de desarrollo.
2. **`feature/offline-etapa1-sesion-indicador`**: Resiliencia de sesión offline y banner de conectividad.
3. **`feature/offline-etapa2-indexeddb-lecturas`**: Motor de base local en IndexedDB y lectura con *Stale-While-Revalidate*.
4. **`feature/offline-etapa3-cola-sincronizacion`**: Encolador de mutaciones offline, UUIDs locales y sincronizador automático al reconectar.
5. **`feature/offline-etapa4-docs-pruebas`**: Pruebas manuales, actualización de README, walkthrough y changelog.

---

## 3. Desglose de Etapas

### Etapa 1: Sesión Offline e Indicador de Red
- **Problema actual**: Al iniciar la aplicación sin internet, `validateStoredSession()` en `src/App.jsx` ejecuta `supabase.auth.getUser()`. Al fallar la red, el código interpreta que no hay usuario y ejecuta `setSession(null)`, expulsando a la usuaria a la pantalla de login.
- **Acciones**:
  1. Detectar si el fallo de validación es por ausencia de conexión (`!navigator.onLine` o errores de tipo network/fetch).
  2. Si es un fallo de red y existe una sesión previa guardada en `localStorage` (`readStoredSession()`), mantener la sesión activa marcando una bandera `isOfflineSession = true`.
  3. Crear el hook `useNetworkStatus` para escuchar eventos `online` y `offline` del navegador.
  4. Agregar un indicador visual elegante en la barra superior o cabecera (`.network-status-badge`) que informe:
     - `Sin conexión (modo offline)` cuando se pierde la red.
     - `Conexión restablecida` durante unos segundos al recuperar la red.
- **Criterios de aceptación**:
  - Al apagar el Wi-Fi / simular offline en DevTools y recargar la página, la sesión no se cierra y la app muestra las pestañas normales con el badge de offline.

---

### Etapa 2: Motor de Almacenamiento Local (IndexedDB) y Lecturas Stale-While-Revalidate
- **Problema actual**: Si no hay internet, cada consulta a `servicios`, `turnos`, `clientes`, `precios` o `gastos` lanza un error y los listados quedan en blanco.
- **Acciones**:
  1. Crear el módulo `src/offline/db.js` utilizando la API nativa de `IndexedDB` (sin dependencias externas pesadas).
     - Almacenes (`object stores`):
       - `clientes` (índice por id y nombre)
       - `turnos` (índice por id y fecha)
       - `servicios` (índice por id y fecha)
       - `precios` (índice por categoria y nombre)
       - `gastos` (índice por id y fecha)
       - `movimientos_caja` (índice por id y fecha)
       - `sync_queue` (cola de mutaciones)
       - `meta` (marcas de tiempo de última sincronización)
  2. Modificar funciones de lectura en `src/services.js`:
     - Estrategia *Stale-While-Revalidate*:
       a) Leer inmediatamente de IndexedDB y emitir datos a la UI (latencia cero).
       b) Si hay conexión, ejecutar la consulta a Supabase en background, guardar la respuesta fresca en IndexedDB y refrescar la vista.
       c) Si no hay conexión, devolver los datos de IndexedDB sin mostrar errores intrusivos.
- **Criterios de aceptación**:
  - Estando sin conexión, abrir las pestañas de Clientes, Precios, Gastos, Estadísticas y Turnos debe mostrar los últimos datos conocidos sin errores.

---

### Etapa 3: Cola de Mutaciones Offline (Outbox Sync Queue) y Optimistic UI
- **Problema actual**: Toda operación de escritura (`saveExpenseToDatabase`, `saveAppointmentToDatabase`, `completePendingPayment`, etc.) intenta un `insert`/`update` directo a Supabase. Sin red, la operación se cancela y se pierde lo cargado.
- **Acciones**:
  1. Crear `src/offline/syncQueue.js`:
     - Función `enqueueOperation({ type, table, action, payload })`.
     - Generación de UUIDs locales con `crypto.randomUUID()`.
     - Actualización inmediata del store de IndexedDB correspondiente (UI optimista).
  2. Interceptar las mutaciones en `src/services.js`:
     - Si `!navigator.onLine`, guardar en IndexedDB + `enqueueOperation`.
     - Retornar el objeto normalizado a la UI como si se hubiera guardado exitosamente.
  3. Procesador de sincronización (`processSyncQueue`):
     - Se dispara al evento `online` o al presionar "Sincronizar ahora".
     - Itera las operaciones en orden FIFO.
     - Maneja dependencias de IDs: si un servicio se creó offline vinculado a un turno nuevo, asegura el orden de resolución.
     - Elimina la operación de la cola al recibir `HTTP 200/201` de Supabase.
  4. Indicador de cola en la UI:
     - Mostrar contador en el badge: `"Modo offline · 2 cambios pendientes"`.
- **Criterios de aceptación**:
  - Crear un gasto o cobrar un turno sin internet: se registra inmediatamente en pantalla.
  - Al encender la conexión, se sincroniza automáticamente con Supabase sin intervención del usuario.

---

### Etapa 4: Pruebas, Documentación, README y Walkthrough
- **Acciones**:
  1. Actualizar `README.md` detallando la arquitectura offline-first y las capacidades de trabajo sin internet.
  2. Crear `docs/WALKTHROUGH_OFFLINE.md` con la guía paso a paso para probar y validar la funcionalidad (DevTools, modo avión, simulación de cortes).
  3. Registrar los cambios en `docs/CHANGELOG.md` siguiendo las reglas de formato de `AGENTS.md`.
  4. Incrementar la versión de `CACHE_VERSION` en `public/sw.js` y verificar con `npm run build`.

---

## 4. Matriz de Compatibilidad y Seguridad

| Área | Modo Online | Modo Offline |
| :--- | :--- | :--- |
| **Autenticación** | Valida token JWT y rol en Supabase | Valida perfil y JWT almacenado en `localStorage` |
| **Lectura de Agenda** | Supabase REST API | IndexedDB store `turnos` |
| **Cobro de Turnos** | RPC / Transacciones en Supabase | Inserción local + encolado en `sync_queue` |
| **Catálogo de Precios** | Consulta en vivo | IndexedDB store `precios` |
| **Gastos / Caja** | Inserción en vivo | Inserción local + encolado en `sync_queue` |
| **Seguridad RLS** | Aplicado por Supabase en el servidor | Validado por Supabase al momento de sincronizar la cola |

