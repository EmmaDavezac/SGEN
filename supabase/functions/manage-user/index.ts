import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function corsHeaders(req?: Request) {
  const origin = req?.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function corsJson(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(req)
    }
  });
}

type ManagePayload =
  | { accion: 'update'; id: string; nombre?: string; telefono?: string; dni?: string; comision_pct?: number; rol?: 'superadmin' | 'admin' | 'manicurista' }
  | { accion: 'toggle_activo'; id: string; activo?: boolean }
  | { accion: 'resend_invite'; id: string }
  | { accion: 'reset_password'; id: string };

async function getAvailableProfileColumns(serviceClient: any) {
  const { data, error } = await serviceClient
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'perfiles');

  if (error || !data) return new Set<string>();
  return new Set((data as Array<{ column_name: string }>).map((row) => row.column_name));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req)
    });
  }

  try {
    requireEnv('SUPABASE_URL', SUPABASE_URL);
    requireEnv('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);

    const authz = req.headers.get('authorization');
    if (!authz || !authz.toLowerCase().startsWith('bearer ')) {
      return corsJson({ code: 'NO_AUTH', message: 'Falta token de autorización.' }, 401, req);
    }
    const bearer = authz.slice('bearer '.length);

    const adminClientAnon = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } }
    });
    const { data: adminUser, error: adminErr } = await adminClientAnon.auth.getUser(bearer);
    if (adminErr || !adminUser?.user) {
      return corsJson({ code: 'BAD_AUTH', message: 'Token inválido.' }, 401, req);
    }

    const { data: adminProfile } = await adminClientAnon
      .from('perfiles')
      .select('id, rol, activo')
      .eq('id', adminUser.user.id)
      .maybeSingle();

    if (!adminProfile || adminProfile.rol !== 'superadmin') {
      return corsJson({ code: 'FORBIDDEN', message: 'Solo el superadmin puede gestionar usuarios.' }, 403, req);
    }
    if (!adminProfile.activo) {
      return corsJson({ code: 'ADMIN_INACTIVO', message: 'Tu perfil se encuentra desactivado.' }, 403, req);
    }

    const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const payload: ManagePayload = await req.json().catch(() => ({ accion: 'update', id: '' }) as ManagePayload);
    const availableColumns = await getAvailableProfileColumns(serviceClient);

    if (!payload.accion || !payload.id) {
      return corsJson({ code: 'BAD_PAYLOAD', message: 'Faltan accion o id.' }, 400, req);
    }

    const { data: targetProfile, error: errTarget } = await serviceClient
      .from('perfiles')
      .select('id, email, nombre, rol, activo')
      .eq('id', payload.id)
      .maybeSingle();

    if (errTarget || !targetProfile) {
      return corsJson(
        { code: 'NOT_FOUND', message: 'Perfil no encontrado.' },
        404,
        req
      );
    }

    // 1) UPDATE
    if (payload.accion === 'update') {
      const patch: Record<string, any> = {};
      if (typeof payload.nombre === 'string' && payload.nombre.trim().length >= 2) patch.nombre = payload.nombre.trim();
      if (typeof payload.telefono === 'string' && availableColumns.has('telefono')) patch.telefono = payload.telefono.trim() || null;
      if (typeof payload.dni === 'string' && availableColumns.has('dni')) patch.dni = payload.dni.trim() || null;
      if (typeof payload.comision_pct === 'number' && availableColumns.has('comision_pct')) {
        const n = Math.max(0, Math.min(100, Number(payload.comision_pct) || 0));
        patch.comision_pct = n;
      }
      if (payload.rol === 'superadmin' || payload.rol === 'admin' || payload.rol === 'manicurista') {
        if (targetProfile.rol === 'superadmin' && payload.rol !== 'superadmin') {
          const { count } = await serviceClient
            .from('perfiles')
            .select('*', { count: 'exact', head: true })
            .eq('rol', 'superadmin')
            .eq('activo', true);
          if ((count || 0) <= 1) {
            return corsJson(
              { code: 'LAST_SUPERADMIN', message: 'No se puede quitar el único superadmin activo.' },
              409,
              req
            );
          }
        }
        patch.rol = payload.rol;
      }

      if (Object.keys(patch).length === 0) {
        return corsJson({ code: 'NO_CHANGES', message: 'Sin cambios para aplicar.' }, 400);
      }

      const { data: updated, error: upErr } = await serviceClient
        .from('perfiles')
        .update({ ...patch, actualizado_en: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();

      if (upErr || !updated) {
        return corsJson({ code: 'UPDATE_ERR', message: upErr?.message || 'Error actualizando.' }, 500);
      }

      if (patch.rol) {
        await serviceClient.auth.admin.updateUserById(payload.id, { app_metadata: { rol: patch.rol } }).catch(() => null);
      }

      return corsJson({ ok: true, accion: 'update', profile: updated });
    }

    // 2) TOGGLE ACTIVO
    if (payload.accion === 'toggle_activo') {
      const nuevo = typeof payload.activo === 'boolean' ? payload.activo : !targetProfile.activo;

      if (!nuevo && targetProfile.rol === 'superadmin') {
        const { count } = await serviceClient
          .from('perfiles')
          .select('*', { count: 'exact', head: true })
          .eq('rol', 'superadmin')
          .eq('activo', true);
        if ((count || 0) <= 1) {
          return corsJson(
            { code: 'LAST_SUPERADMIN', message: 'No se puede desactivar al único superadmin activo.' },
            409
          );
        }
      }

      if (!nuevo) {
        await serviceClient.auth.admin.signOut(payload.id).catch(() => null);
      }

      const { data: toggled, error: tErr } = await serviceClient
        .from('perfiles')
        .update({ activo: nuevo, actualizado_en: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();

      if (tErr || !toggled) {
        return corsJson({ code: 'TOGGLE_ERR', message: tErr?.message || 'Error activando/desactivando.' }, 500);
      }

      return corsJson({ ok: true, accion: 'toggle_activo', activo: toggled.activo, profile: toggled });
    }

    // 3) RESEND INVITE (crea link magico por email - Supabase se encarga)
    if (payload.accion === 'resend_invite') {
      const r = await serviceClient.auth.admin.inviteUserByEmail(targetProfile.email, {
        data: { nombre: targetProfile.nombre, rol: targetProfile.rol },
        redirectTo: undefined
      });
      if (r.error) {
        return corsJson({ code: 'INVITE_ERR', message: r.error.message }, 500);
      }
      return corsJson({ ok: true, accion: 'resend_invite', message: 'Invitación reenviada.' });
    }

    // 4) RESET PASSWORD: disparamos recovery email
    if (payload.accion === 'reset_password') {
      const publicClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const r = await publicClient.auth.resetPasswordForEmail(targetProfile.email, {});
      if (r.error) {
        return corsJson({ code: 'RESET_ERR', message: r.error.message }, 500);
      }
      return corsJson({ ok: true, accion: 'reset_password', message: 'Mail de recuperación enviado.' });
    }

    return corsJson({ code: 'BAD_ACCION', message: 'Acción no reconocida.' }, 400);
  } catch (err: any) {
    console.error(err);
    return corsJson(
      {
        code: 'SERVER_ERROR',
        message: err?.message || 'Error interno del servidor.'
      },
      500
    );
  }
});
