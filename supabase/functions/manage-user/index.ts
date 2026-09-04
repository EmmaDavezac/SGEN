import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function corsJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}

type ManagePayload =
  | { accion: 'update'; id: string; nombre?: string; telefono?: string; dni?: string; comision_pct?: number; rol?: 'admin' | 'manicurista' }
  | { accion: 'toggle_activo'; id: string; activo?: boolean }
  | { accion: 'resend_invite'; id: string }
  | { accion: 'reset_password'; id: string };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsJson(null, 204);
  }

  try {
    requireEnv('SUPABASE_URL', SUPABASE_URL);
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);

    const authz = req.headers.get('authorization');
    if (!authz || !authz.toLowerCase().startsWith('bearer ')) {
      return corsJson({ code: 'NO_AUTH', message: 'Falta token de autorización.' }, 401);
    }
    const bearer = authz.slice('bearer '.length);

    const adminClientAnon = createClient(SUPABASE_URL!, bearer, { auth: { persistSession: false } });
    const { data: adminUser, error: adminErr } = await adminClientAnon.auth.getUser(bearer);
    if (adminErr || !adminUser?.user) {
      return corsJson({ code: 'BAD_AUTH', message: 'Token inválido.' }, 401);
    }

    const { data: adminProfile } = await adminClientAnon
      .from('perfiles')
      .select('id, rol, activo')
      .eq('id', adminUser.user.id)
      .maybeSingle();

    if (!adminProfile || adminProfile.rol !== 'admin') {
      return corsJson({ code: 'FORBIDDEN', message: 'Solo administradores pueden gestionar usuarios.' }, 403);
    }
    if (!adminProfile.activo) {
      return corsJson({ code: 'ADMIN_INACTIVO', message: 'Tu perfil se encuentra desactivado.' }, 403);
    }

    const payload: ManagePayload = await req.json().catch(() => ({ accion: 'update', id: '' }) as ManagePayload);

    if (!payload.accion || !payload.id) {
      return corsJson({ code: 'BAD_PAYLOAD', message: 'Faltan accion o id.' }, 400);
    }

    const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: targetProfile, error: errTarget } = await serviceClient
      .from('perfiles')
      .select('id, email, nombre, rol, activo')
      .eq('id', payload.id)
      .maybeSingle();

    if (errTarget || !targetProfile) {
      return corsJson(
        { code: 'NOT_FOUND', message: 'Perfil no encontrado.' },
        404
      );
    }

    // 1) UPDATE
    if (payload.accion === 'update') {
      const patch: Record<string, any> = {};
      if (typeof payload.nombre === 'string' && payload.nombre.trim().length >= 2) patch.nombre = payload.nombre.trim();
      if (typeof payload.telefono === 'string') patch.telefono = payload.telefono.trim() || null;
      if (typeof payload.dni === 'string') patch.dni = payload.dni.trim() || null;
      if (typeof payload.comision_pct === 'number') {
        const n = Math.max(0, Math.min(100, Number(payload.comision_pct) || 0));
        patch.comision_pct = n;
      }
      if (payload.rol === 'admin' || payload.rol === 'manicurista') {
        // No permitimos quitar el ultimo admin
        if (payload.rol !== 'admin' && targetProfile.rol === 'admin') {
          const { count } = await serviceClient
            .from('perfiles')
            .select('*', { count: 'exact', head: true })
            .eq('rol', 'admin')
            .eq('activo', true);
          if ((count || 0) <= 1) {
            return corsJson(
              { code: 'LAST_ADMIN', message: 'No se puede degradar al único administrador activo.' },
              409
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
        await serviceClient.auth.admin.updateUserById(payload.id, { role: patch.rol === 'admin' ? 'service_role' : undefined, app_metadata: { rol: patch.rol } }).catch(() => null);
      }

      return corsJson({ ok: true, accion: 'update', profile: updated });
    }

    // 2) TOGGLE ACTIVO
    if (payload.accion === 'toggle_activo') {
      const nuevo = typeof payload.activo === 'boolean' ? payload.activo : !targetProfile.activo;

      if (!nuevo && targetProfile.rol === 'admin') {
        const { count } = await serviceClient
          .from('perfiles')
          .select('*', { count: 'exact', head: true })
          .eq('rol', 'admin')
          .eq('activo', true);
        if ((count || 0) <= 1) {
          return corsJson(
            { code: 'LAST_ADMIN', message: 'No se puede desactivar al único administrador activo.' },
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
