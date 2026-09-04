import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN');
const GOOGLE_CALENDAR_ID = Deno.env.get('GOOGLE_CALENDAR_ID') ?? 'primary';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function parseDate(value: string | null | undefined, fallbackDate?: Date) {
  if (!value) {
    return fallbackDate ? new Date(fallbackDate) : new Date();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return fallbackDate ? new Date(fallbackDate) : new Date();
}

function buildCalendarEvent(appointment: Record<string, any>) {
  const clientName = appointment.cliente || 'Cliente';
  const startRaw = appointment.hora_inicio || appointment.horaInicio || `${appointment.fecha || new Date().toISOString().slice(0, 10)}T09:00:00`;
  const endRaw = appointment.hora_fin || appointment.horaFin || null;

  const startDate = parseDate(startRaw);
  const endDate = endRaw ? parseDate(endRaw, startDate) : new Date(startDate.getTime() + 90 * 60 * 1000);

  return {
    summary: `Turno - ${clientName}`,
    description: [
      `Servicio: ${appointment.servicio || 'Turno'}`,
      `Cliente: ${clientName}`,
      `Estado: ${appointment.estado || 'provisional'}`,
      `Precio: $${Number(appointment.precio || 0).toLocaleString('es-AR')}`,
      `Recordatorio interno: ${appointment.id || appointment.legacy_id || 'sin-id'}`
    ].join('\n'),
    start: {
      dateTime: startDate.toISOString()
    },
    end: {
      dateTime: endDate.toISOString()
    }
  };
}

async function getAccessToken() {
  const clientId = requireEnv('GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID);
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET', GOOGLE_CLIENT_SECRET);
  const refreshToken = requireEnv('GOOGLE_REFRESH_TOKEN', GOOGLE_REFRESH_TOKEN);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`No se pudo obtener el access token de Google: ${payload.error || 'unknown_error'}`);
  }

  return payload.access_token as string;
}

async function withRetry<T>(label: string, callback: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw new Error(`Fallo en ${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function syncGoogleCalendarEvent(action: string, appointment: Record<string, any>, accessToken: string) {
  const calendarId = encodeURIComponent(GOOGLE_CALENDAR_ID);
  const eventId = appointment.event_id || appointment.eventId;

  if (action === 'delete') {
    if (!eventId) {
      return { deleted: false, eventId: null };
    }

    const response = await fetch(`${GOOGLE_CALENDAR_BASE_URL}/${calendarId}/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Error al borrar el evento de Google Calendar: ${response.status}`);
    }

    return { deleted: true, eventId };
  }

  const eventBody = buildCalendarEvent(appointment);
  const url = eventId
    ? `${GOOGLE_CALENDAR_BASE_URL}/${calendarId}/events/${encodeURIComponent(eventId)}`
    : `${GOOGLE_CALENDAR_BASE_URL}/${calendarId}/events`;

  const response = await fetch(url, {
    method: eventId ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventBody)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'No se pudo sincronizar con Google Calendar.');
  }

  return {
    eventId: payload.id,
    deleted: false,
    payload
  };
}

async function persistEventId(appointment: Record<string, any>, eventId: string | null) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const query = supabase.from('turnos').update({ event_id: eventId });

  if (appointment.legacy_id) {
    query.eq('legacy_id', appointment.legacy_id);
  } else if (appointment.id) {
    query.eq('legacy_id', appointment.id);
  } else if (appointment.event_id) {
    query.eq('event_id', appointment.event_id);
  }

  const { error } = await query;
  if (error) {
    console.warn('No se pudo persistir event_id en Supabase:', error.message);
    return { skipped: false, error };
  }

  return { skipped: false, updated: true };
}

serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || 'create').toLowerCase();
    const appointment = payload.appointment || {};

    if (!appointment || !appointment.cliente && action !== 'delete') {
      return new Response(JSON.stringify({ success: false, message: 'Falta appointment.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const accessToken = await withRetry('obtener token OAuth', () => getAccessToken());
    const result = await withRetry(`sincronizar evento ${action}`, () => syncGoogleCalendarEvent(action, appointment, accessToken));

    if (action === 'delete') {
      const eventIdToClear = appointment.event_id || appointment.eventId || result.eventId;
      await persistEventId(appointment, null);
      return new Response(JSON.stringify({
        success: true,
        action,
        eventId: eventIdToClear,
        deleted: result.deleted
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const eventId = result.eventId || appointment.event_id || appointment.eventId || null;
    await persistEventId(appointment, eventId);

    return new Response(JSON.stringify({
      success: true,
      action,
      eventId,
      calendarEvent: result.payload || null
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[google-calendar]', message);

    return new Response(JSON.stringify({
      success: false,
      message,
      warning: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
