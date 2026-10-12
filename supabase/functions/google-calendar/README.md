# Google Calendar bridge

Google Calendar se opera desde el Apps Script existente, ejecutado como la cuenta dueña del calendario. Supabase guarda los turnos; el Apps Script solo crea/actualiza el evento y no escribe filas en Sheets.

## Configuración de Apps Script

1. Crea un proyecto nuevo en [Google Apps Script](https://script.google.com/).
2. Pega el contenido de [`docs/google_calendar_bridge.gs`](../../../docs/google_calendar_bridge.gs) y guarda el proyecto.
3. En **Configuración del proyecto > Propiedades del script**, configura `CALENDAR_BRIDGE_SECRET` con una clave aleatoria larga. Opcionalmente configura `CALENDAR_ID`; si se omite, usa el calendario principal.
4. En **Implementar > Nueva implementación > Aplicación web**, elige ejecutar como tu cuenta y configura el acceso para que la Edge Function pueda llamar al endpoint.
5. Autoriza los permisos de Calendar con la cuenta cuyo calendario recibirá los turnos; copia la URL `/exec` de la implementación.

La acción `sync_calendar_event` y `update_calendar_event` validan el secreto, usan el ID UUID de Supabase como clave idempotente, crean o actualizan un único evento y devuelven su `eventId`. La acción `delete_calendar_event` borra por `eventId` guardado o por marcador `ID Evolet: <uuid>` y siempre limpia la propiedad. No necesita SpreadsheetApp y no agrega filas a Sheets.

El calendario destino se resuelve con prioridad: `calendarId` enviado por la Edge Function > propiedad `CALENDAR_ID` en Apps Script > calendario principal.

## Secretos de Supabase

En **Project Settings > Edge Functions > Secrets** configura:

- `GOOGLE_APPS_SCRIPT_URL`: URL `/exec` de la implementación web.
- `GOOGLE_APPS_SCRIPT_SECRET`: el mismo valor que `CALENDAR_BRIDGE_SECRET` en Apps Script.
- `GOOGLE_CALENDAR_ID`: ID del calendario destino, por ejemplo `66c3ae6263491d71ff4e1ce61677018ec9d85a12a3bd677a301d927d62ae1b74@group.calendar.google.com`. La Edge lo envía a Apps Script en cada `create/update/delete`.

La función Edge también necesita `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, ya configurados para el proyecto. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` y `GOOGLE_CALENDAR_ID` ya no se usan en esta arquitectura.

Después de guardar los secretos, vuelve a desplegar:

```sh
npx supabase functions deploy google-calendar --no-verify-jwt
```

Los turnos guardados sin `event_id` se pueden reintentar desde la acción de sincronización de la agenda. Los reintentos reutilizan el evento asociado al ID de Supabase para evitar duplicados.

> No pongas el secreto compartido, credenciales de Google ni `SUPABASE_SERVICE_ROLE_KEY` en el frontend o en el repositorio.
