# Google Calendar Edge Function

Esta función corre en Supabase Edge Functions y se encarga de sincronizar eventos de turnos con Google Calendar sin exponer secretos en el frontend.

## Variables de entorno requeridas

Configurar en Supabase > Project Settings > Edge Function environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID` (opcional; usa `primary` si no se define)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Flujo

El frontend solo llama a la función Edge con acciones como:

- `create`
- `update`
- `delete`

La función:

1. Obtiene un token OAuth de Google.
2. Crea, actualiza o elimina el evento.
3. Persiste `turnos.event_id` en Supabase.
4. Maneja reintentos y devuelve un `warning` si Google Calendar falla sin bloquear la operación principal.

## Ejemplo de invocación

```ts
await supabase.functions.invoke('google-calendar', {
  body: {
    action: 'create',
    appointment: {
      legacy_id: 'app_123',
      cliente: 'Ana',
      fecha: '2026-08-23',
      hora_inicio: '2026-08-23T10:00:00.000Z',
      hora_fin: '2026-08-23T11:30:00.000Z',
      servicio: 'Turno',
      estado: 'reservado',
      precio: 2500
    }
  }
});
```

> Nunca agregues client_id, client_secret, refresh token ni service role key al frontend.
