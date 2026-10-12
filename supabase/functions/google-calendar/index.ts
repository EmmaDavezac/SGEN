import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const GOOGLE_APPS_SCRIPT_URL = Deno.env.get('GOOGLE_APPS_SCRIPT_URL');
const GOOGLE_APPS_SCRIPT_SECRET = Deno.env.get('GOOGLE_APPS_SCRIPT_SECRET');
const GOOGLE_CALENDAR_ID = Deno.env.get('GOOGLE_CALENDAR_ID') || Deno.env.get('CALENDAR_ID') || Deno.env.get('GOOGLE_APPS_SCRIPT_CALENDAR_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) }
  });
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
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

async function syncWithAppsScript(appointment: Record<string, any>, scriptAction = 'sync_calendar_event') {
  const url = requireEnv('GOOGLE_APPS_SCRIPT_URL', GOOGLE_APPS_SCRIPT_URL);
  const secret = requireEnv('GOOGLE_APPS_SCRIPT_SECRET', GOOGLE_APPS_SCRIPT_SECRET);
  const calendarId = GOOGLE_CALENDAR_ID || appointment.calendar_id || appointment.calendarId || null;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: scriptAction,
      secret,
      calendarId,
      appointment: {
        id: appointment.database_id || appointment.id,
        eventId: appointment.event_id || appointment.eventId || null,
        fecha: appointment.fecha,
        horaInicio: appointment.hora_inicio,
        horaFin: appointment.hora_fin,
        cliente: appointment.cliente,
        servicio: appointment.servicio,
        precio: appointment.precio,
        estado: appointment.estado
      }
    })
  });

  const result = await response.json().catch(() => null);
  if (scriptAction === 'delete_calendar_event') {
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || `Apps Script respondió HTTP ${response.status}.`);
    }
    return result;
  }
  if (!response.ok || !result?.success || !result.eventId) {
    throw new Error(result?.message || `Apps Script respondió HTTP ${response.status}.`);
  }
  return result;
}

function isUuidLike(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function findTurnoByIdOrLegacy(authClient, databaseId) {
  if (!databaseId) return { stored: null, error: null };
  if (isUuidLike(databaseId)) {
    const { data, error } = await authClient
      .from('turnos')
      .select('id, legacy_id, cliente_id, usuario_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, clientes(nombre)')
      .eq('id', databaseId)
      .maybeSingle();
    if (data) return { stored: data, error: null };
    // Si el UUID no existe, igual intentar por legacy por las dudas, sin romper por 22P02.
    return { stored: null, error };
  }
  const { data, error } = await authClient
    .from('turnos')
    .select('id, legacy_id, cliente_id, usuario_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id, clientes(nombre)')
    .eq('legacy_id', databaseId)
    .maybeSingle();
  return { stored: data, error };
}

async function persistEventId(appointment: Record<string, any>, eventId: string | null) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let query = supabase.from('turnos').update({ event_id: eventId });

  if (appointment.database_id) {
    query.eq('id', appointment.database_id);
  } else if (appointment.id) {
    query.eq('id', appointment.id);
  } else if (appointment.legacy_id) {
    query.eq('legacy_id', appointment.legacy_id);
  } else if (appointment.event_id) {
    query.eq('event_id', appointment.event_id);
  }

  const { data, error } = await query.select('id').maybeSingle();
  if (error) {
    console.warn('No se pudo persistir event_id en Supabase:', error.message);
    return { skipped: false, error };
  }
  if (!data) {
    return { skipped: false, error: new Error('No se encontró el turno para asociar el evento de Calendar.') };
  }

  return { skipped: false, updated: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  try {
    requireEnv('SUPABASE_URL', SUPABASE_URL);
    requireEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return jsonResponse(req, { success: false, message: 'Falta la sesión de usuario.' }, 401);
    }
    const bearer = authHeader.slice('bearer '.length);
    const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } }
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
    if (authError || !authData.user) {
      return jsonResponse(req, { success: false, message: 'La sesión no es válida. Volvé a ingresar.' }, 401);
    }
    const { data: profile, error: profileError } = await authClient
      .from('perfiles')
      .select('activo, rol')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError || !profile?.activo) {
      return jsonResponse(req, { success: false, message: 'El usuario no tiene acceso activo.' }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || 'create').toLowerCase();
    let appointment = payload.appointment || {};

    if (appointment.database_id) {
      // No romper por 22P02 cuando viene legacy_id (app_...) en columna UUID.
      const { stored: storedAppointment } = await findTurnoByIdOrLegacy(authClient, appointment.database_id);
      if (!storedAppointment) {
        // En delete no bloqueamos por esto: la fila pudo borrarse justo antes;
        // igual intentamos borrar en Calendar por event_id si lo tenemos.
        if (action === 'delete' && (appointment.event_id || appointment.eventId)) {
          const orphanEventId = appointment.event_id || appointment.eventId;
          const result = await withRetry('eliminar evento con Apps Script', () => syncWithAppsScript({
            database_id: appointment.database_id,
            id: appointment.database_id,
            event_id: orphanEventId,
            eventId: orphanEventId
          }, 'delete_calendar_event'));
          return jsonResponse(req, { success: true, action, deleted: result.deleted !== false, eventId: orphanEventId });
        }
        // create/update sí necesitan el turno en DB.
        if (action !== 'delete') {
          return jsonResponse(req, { success: false, message: 'No se encontró el turno o no tienes acceso.' }, 404);
        }
      } else {
        // Cualquiera autenticado y activo puede sincronizar/borrar su turno.
        // El DELETE físico en la tabla lo autoriza RLS (dueño o admin).
        appointment = {
          ...storedAppointment,
          database_id: storedAppointment.id,
          cliente: storedAppointment.clientes?.nombre || 'Cliente'
        };
      }
    }

    if (!appointment || !appointment.cliente && action !== 'delete') {
      return jsonResponse(req, { success: false, message: 'Falta appointment.' }, 400);
    }

    if (action === 'delete') {
      const deleteId = appointment.database_id || appointment.id || appointment.legacy_id || null;
      const deleteEventId = appointment.event_id || appointment.eventId || null;
      if (!deleteId && !deleteEventId) {
        return jsonResponse(req, { success: false, message: 'Falta el turno a eliminar en Calendar.' }, 400);
      }
      const result = await withRetry('eliminar evento con Apps Script', () => syncWithAppsScript({
        database_id: deleteId,
        id: deleteId,
        event_id: deleteEventId,
        eventId: deleteEventId
      }, 'delete_calendar_event'));
      return jsonResponse(req, {
        success: true,
        action,
        deleted: result.deleted !== false,
        eventId: deleteEventId
      });
    }

    if (action !== 'create' && action !== 'update') {
      return jsonResponse(req, { success: false, message: 'Acción no soportada. Usa create, update o delete.' }, 400);
    }
    const result = await withRetry(action === 'update' ? 'actualizar evento con Apps Script' : 'crear evento con Apps Script', () => syncWithAppsScript(appointment, 'sync_calendar_event'));

    const eventId = result.eventId;
    const persisted = await persistEventId(appointment, eventId);
    if (persisted.error || persisted.skipped) {
      throw new Error('El evento se creó en Google Calendar, pero no se pudo guardar su ID en el turno de Supabase.');
    }

    return jsonResponse(req, {
      success: true,
      action,
      eventId,
      calendarEvent: result.event || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[google-calendar]', message);

    return jsonResponse(req, {
      success: false,
      message,
      warning: true
    });
  }
});
