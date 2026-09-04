# Edge Functions: Gestión de Usuarios (Opción 4 — Invitaciones por email)

Par implementar el panel de usuarios del dashboard (admin-only), dependemos de **dos Edge Functions** en Supabase.
Ambas autentican al requester validando que `perfiles.rol === 'admin'` y usan el `SUPABASE_SERVICE_ROLE_KEY` para llamar al Admin API de Supabase Auth (crear usuarios, mandar invitaciones, etc.). **Nunca exponemos el Service Role al frontend.**

## Edge Functions disponibles

1. **`invite-user`** → Invitar una nueva usuaria.
2. **`manage-user`** → Actualizar / desactivar / reenviar invitación / resetear contraseña de un usuario existente.

## Setup

### 1. Configurar la `SUPABASE_SERVICE_ROLE_KEY` como Secret

En el Dashboard de Supabase → **Edge Functions → Secrets** (o por CLI):

```bash
# 1. Vincular proyecto (una sola vez)
supabase link --project-ref TU-PROYECTO-REF

# 2. Setear los secrets (incluye el SUPABASE_SERVICE_ROLE_KEY y Google para el otro fn)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

> ⚠️ Si también usás Google Calendar, ya tenías estos seteados; el service role se puede reutilizar entre functions.

### 2. Deploy de las functions

```bash
# Invite user
supabase functions deploy invite-user

# Manage user
supabase functions deploy manage-user
```

El CLI automáticamente tomará el código de:
- `supabase/functions/invite-user/index.ts`
- `supabase/functions/manage-user/index.ts`

No hace falta un `config.toml` especial a menos que quieras CORS customizado (ambas functions ya responden CORS a `*` para integración simple con la PWA hosteada donde sea).

---

## Cómo consumirlas desde el frontend

`App.jsx` / `SettingsPanel.jsx` ya traen wrappers que usan:

```ts
const { data, error } = await supabase.functions.invoke('invite-user', {
  body: { email, nombre, rol, telefono, dni, comision_pct }
});

const { data, error } = await supabase.functions.invoke('manage-user', {
  body: { accion: 'update' | 'toggle_activo' | 'resend_invite' | 'reset_password', id, ...payload }
});
```

Ambas functions esperan `Authorization: Bearer <anon user JWT>` en el header. El SDK de Supabase lo agrega solo.

## Seguridad (checklist)

- [x] `Allow new users to sign up` = **OFF** en Supabase Auth Providers.
- [x] `Confirm email` = **OFF** (la invitación ya confirma el mail).
- [x] `SUPABASE_SERVICE_ROLE_KEY` guardada en Secrets (no en código ni en `VITE_*`).
- [x] Ninguna function acepta requests sin JWT ni con JWT de usuario no-admin.
- [x] `manage-user` **nunca permite degradar / desactivar al último admin activo**.
- [x] Migración 0022 aplicada (columna `activo`, trigger `sync_perfiles_after_user_create`, RLS).
