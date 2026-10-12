-- Migracion 0022 - Columnas nuevas de seguridad y perfil, trigger sync auth.users -> perfiles, RLS admin-only writes
-- Maneja idempotencia por si las columnas / politicas ya existian en ambientes anteriores.

-- =====================================================================
-- 1. Nuevas columnas en perfiles
-- =====================================================================
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'perfiles'
          and column_name = 'activo'
    ) then
        alter table public.perfiles add column activo boolean not null default true;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'perfiles'
          and column_name = 'last_login_at'
    ) then
        alter table public.perfiles add column last_login_at timestamptz;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'perfiles'
          and column_name = 'dni'
    ) then
        alter table public.perfiles add column dni text;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'perfiles'
          and column_name = 'telefono'
    ) then
        alter table public.perfiles add column telefono text;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'perfiles'
          and column_name = 'comision_pct'
    ) then
        alter table public.perfiles add column comision_pct numeric(6, 3) not null default 0
            constraint perfiles_comision_valida check (comision_pct between 0 and 100);
    end if;
end $$;

-- =====================================================================
-- 2. Helper para normalizar emails y que perfiles siempre coincidan con auth.users
-- =====================================================================
create or replace function public.email_normalizado(p_email text)
returns text
language sql
immutable
as $$
    select lower(trim(both ' ' from p_email));
$$;

revoke all on function public.email_normalizado(text) from public;
grant execute on function public.email_normalizado(text) to authenticated, service_role;

-- =====================================================================
-- 3. Trigger function: cuando se crea un auth.users (por invite o servicio),
--    inserta automaticamente un perfil minimo (con rol 'manicurista' por default).
--    Si el admin ya inserto el perfil via Edge Function, no hace nada (upsert by id).
-- =====================================================================
create or replace function public.sync_perfiles_after_user_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (TG_OP = 'INSERT') then
        insert into public.perfiles (id, email, nombre, rol, activo)
        values (
            NEW.id,
            public.email_normalizado(NEW.email),
            coalesce(NEW.raw_user_meta_data ->> 'nombre', split_part(NEW.email, '@', 1)),
            coalesce(NEW.raw_user_meta_data ->> 'rol', 'manicurista'),
            true
        )
        on conflict (id) do update set
            email = excluded.email,
            nombre = case when perfiles.nombre is null then excluded.nombre else perfiles.nombre end,
            activo = case when perfiles.activo is null then true else perfiles.activo end;

        -- Si el admin manda data extra via metadata (invite desde Edge Function), pisamos campos opcionales
        if NEW.raw_user_meta_data ? 'telefono' then
            update public.perfiles set telefono = NEW.raw_user_meta_data ->> 'telefono' where id = NEW.id;
        end if;
        if NEW.raw_user_meta_data ? 'dni' then
            update public.perfiles set dni = NEW.raw_user_meta_data ->> 'dni' where id = NEW.id;
        end if;
        if NEW.raw_user_meta_data ? 'comision_pct' then
            update public.perfiles
            set comision_pct = (NEW.raw_user_meta_data ->> 'comision_pct')::numeric(6,3)
            where id = NEW.id;
        end if;
    end if;

    return NEW;
end;
$$;

revoke all on function public.sync_perfiles_after_user_create() from public;

drop trigger if exists sync_perfiles_after_user_create_trigger on auth.users;
create trigger sync_perfiles_after_user_create_trigger
after insert on auth.users
for each row
execute function public.sync_perfiles_after_user_create();

-- =====================================================================
-- 4. Funcion helper para el Login: actualiza last_login_at de un perfil.
--    La llama el cliente luego de signInWithSupabase exitoso.
-- =====================================================================
create or replace function public.touch_profile_login(uid uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_activo boolean;
begin
    select activo into strict v_activo
    from public.perfiles
    where id = uid;

    if not v_activo then
        raise exception 'USUARIO_DESACTIVADO';
    end if;

    update public.perfiles
       set last_login_at = now(),
           actualizado_en = now()
     where id = uid;

    return true;
end;
$$;

revoke all on function public.touch_profile_login(uuid) from public;
grant execute on function public.touch_profile_login(uuid) to authenticated;

-- =====================================================================
-- 5. Politicas RLS complementarias para perfiles (si no existen):
--    - Admin ve y modifica todos los perfiles.
--    - Usuaria ve y modifica SOLO el suyo propio.
--    - Nadie elimina perfiles desde el cliente (soft delete via activo = false).
-- =====================================================================
drop policy if exists perfiles_insert_admin_only on public.perfiles;
drop policy if exists perfiles_update_admin_or_self on public.perfiles;
drop policy if exists perfiles_delete_admin_only on public.perfiles;

create policy perfiles_insert_admin_only
on public.perfiles for insert to authenticated
with check (public.es_admin_actual());

create policy perfiles_update_admin_or_self
on public.perfiles for update to authenticated
using (id = auth.uid() or public.es_admin_actual())
with check (
    -- Una usuaria no puede cambiar su propio rol ni su estado activo
    -- (salvo que sea admin).
    (
        id = auth.uid() and not public.es_admin_actual()
        and rol = (select rol from public.perfiles where id = auth.uid())
        and activo = (select activo from public.perfiles where id = auth.uid())
    )
    or
    (public.es_admin_actual())
);

create policy perfiles_delete_admin_only
on public.perfiles for delete to authenticated
using (public.es_admin_actual());

-- =====================================================================
-- 6. Backfill rapido: si habia perfiles viejos sin estas columnas, pone defaults.
-- =====================================================================
update public.perfiles
   set activo = coalesce(activo, true),
       comision_pct = coalesce(comision_pct, 0)
 where activo is null
    or comision_pct is null;
