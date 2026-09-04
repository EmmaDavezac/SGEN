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

type InvitePayload = {
  email?: string;
  nombre?: string;
  rol?: 'admin' | 'manicurista';
  telefono?: string;
  dni?: string;
  comision_pct?: number;
};

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
      .select('id, rol, email, activo')
      .eq('id', adminUser.user.id)
      .maybeSingle();

    if (!adminProfile || adminProfile.rol !== 'admin') {
      return corsJson({ code: 'FORBIDDEN', message: 'Solo administradores pueden invitar usuarios.' }, 403);
    }
    if (!adminProfile.activo) {
      return corsJson({ code: 'ADMIN_INACTIVO', message: 'Tu perfil se encuentra desactivado.' }, 403);
    }

    const payload: InvitePayload = await req.json().catch(() => ({} as InvitePayload));
    const email = (payload.email || '').trim().toLowerCase();
    const nombre = (payload.nombre || '').trim();
    const rol = payload.rol === 'admin' ? 'admin' : 'manicurista';
    const telefono = payload.telefono ? payload.telefono.trim() : undefined;
    const dni = payload.dni ? payload.dni.trim() : undefined;
    const comision_pct_raw = payload.comision_pct === 0 ? 0 : Number(payload.comision_pct || 0);
    const comision_pct = Number.isFinite(comision_pct_raw) ? Math.max(0, Math.min(100, comision_pct_raw)) : 0;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return corsJson({ code: 'BAD_EMAIL', message: 'Email inválido.' }, 400);
    }
    if (nombre.length < 2) {
      return corsJson({ code: 'BAD_NOMBRE', message: 'El nombre debe tener al menos 2 caracteres.' }, 400);
    }

    const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const userMetadata: Record<string, unknown> = {
      nombre,
      rol
    };
    if (telefono) userMetadata.telefono = telefono;
    if (dni) userMetadata.dni = dni;
    userMetadata.comision_pct = comision_pct;

    const { data: usuariosExistentes } = await serviceClient
      .from('perfiles')
      .select('id, email, nombre, activo')
      .ilike('email', email)
      .maybeSingle();

    if (usuariosExistentes) {
      return corsJson(
        {
          code: 'USUARIO_EXISTE',
          message: 'Ya existe un usuario con ese email.',
          profile: usuariosExistentes
        },
        409
      );
    }

    const inviteRes = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: userMetadata,
      redirectTo: undefined
    });

    if (inviteRes.error) {
      const msg = inviteRes.error.message || 'Error enviando la invitación.';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
        return corsJson(
          {
            code: 'AUTH_EMAIL_EXISTS',
            message: 'El email ya pertenece a una cuenta de Supabase. Usá la acción Reenviar invitación desde el panel.'
          },
          409
        );
      }
      return corsJson({ code: 'INVITE_ERROR', message: msg }, 500);
    }

    const uid = inviteRes.data.user?.id;
    if (!uid) {
      return corsJson({ code: 'NO_UID', message: 'No se pudo crear el usuario. Reintentá.' }, 500);
    }

    const { data: nuevoPerfil, error: perfilesErr } = await serviceClient
      .from('perfiles')
      .upsert(
        {
          id: uid,
          email,
          nombre,
          rol,
          telefono,
          dni,
          comision_pct,
          activo: true
        },
        { onConflict: 'id' }
      )
      .select('id, email, nombre, rol, telefono, dni, comision_pct, activo, creado_en')
      .single();

    if (perfilesErr || !nuevoPerfil) {
      return corsJson(
        {
          code: 'PERFIL_ERR',
          message: perfilesErr?.message || 'No se pudo crear el perfil.'
        },
        500
      );
    }

    return corsJson({
      ok: true,
      message: 'Invitación enviada correctamente.',
      profile: nuevoPerfil
    });
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
