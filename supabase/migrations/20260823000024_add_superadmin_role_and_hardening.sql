-- Migracion 0024 - Superadmin como unico rol capaz de modificar privilegios administrativos.

-- 1. Permitir el nuevo rol en el modelo de perfiles.
alter table public.perfiles
drop constraint if exists perfiles_rol_valido;

alter table public.perfiles
    add constraint perfiles_rol_valido
    check (rol in ('superadmin', 'admin', 'manicurista'));

-- 2. Helpers de autorizacion.
create or replace function public.es_superadmin_actual()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.perfiles
        where id = auth.uid()
          and rol = 'superadmin'
    );
$$;

revoke all on function public.es_superadmin_actual() from public;
grant execute on function public.es_superadmin_actual() to authenticated;

create or replace function public.es_admin_actual()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.perfiles
        where id = auth.uid()
          and rol in ('admin', 'superadmin')
    );
$$;

revoke all on function public.es_admin_actual() from public;
grant execute on function public.es_admin_actual() to authenticated;

-- 3. Proteccion de roles: ni un admin ni el cliente pueden cambiar el rol de otro perfil.
create or replace function public.proteger_roles_perfiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- La Edge Function usa service_role para aplicar cambios autorizados por un superadmin.
    -- En ese contexto no existe un auth.uid() de usuario, por lo que la validacion debe
    -- realizarse previamente en la funcion del servidor y el trigger solo protege la base.
    if current_setting('role', true) = 'service_role' then
        return NEW;
    end if;

    -- El superadmin puede cambiar cualquier rol incluido el de otros admins.
    -- Los admin y manicuristas no pueden alterar roles, y tampoco poder degradar o eliminar al ultimo superadmin.
    if TG_OP = 'INSERT' then
        if NEW.rol is not null and NEW.rol not in ('superadmin', 'admin', 'manicurista') then
            raise exception 'ROL_INVALIDO';
        end if;
    end if;

    if TG_OP = 'UPDATE' and coalesce(OLD.rol, '') <> coalesce(NEW.rol, '') then
        if not public.es_superadmin_actual() then
            raise exception 'SOLO_SUPERADMIN_PUEDE_MODIFICAR_ROLES';
        end if;

        if NEW.rol = 'superadmin' and OLD.rol is not null and OLD.rol <> 'superadmin' then
            return NEW;
        end if;

        if OLD.rol = 'superadmin' and NEW.rol <> 'superadmin' then
            if (
                select count(*)
                from public.perfiles
                where rol = 'superadmin'
                  and activo = true
            ) <= 1 then
                raise exception 'NO_SE_PUEDE_DEJAR_SIN_SUPERADMIN';
            end if;
        end if;
    end if;

    return NEW;
end;
$$;

revoke all on function public.proteger_roles_perfiles() from public;

drop trigger if exists proteger_roles_perfiles_trigger on public.perfiles;
create trigger proteger_roles_perfiles_trigger
before insert or update of rol
on public.perfiles
for each row
execute function public.proteger_roles_perfiles();

-- 4. Mantener la regla de seguridad en el RLS de perfiles.
drop policy if exists perfiles_update_admin_or_self on public.perfiles;
create policy perfiles_update_admin_or_self
on public.perfiles for update to authenticated
using (id = auth.uid() or public.es_admin_actual())
with check (
    (
        id = auth.uid()
        and not public.es_superadmin_actual()
        and rol = (select rol from public.perfiles where id = auth.uid())
        and activo = (select activo from public.perfiles where id = auth.uid())
    )
    or
    public.es_superadmin_actual()
    or
    (
        public.es_admin_actual()
        and not public.es_superadmin_actual()
        and rol = (select rol from public.perfiles where id = auth.uid())
        and activo = (select activo from public.perfiles where id = auth.uid())
    )
);

-- 5. Evitar cambios de rol mediante una actualizacion de perfil por cliente.
drop policy if exists perfiles_insert_admin_only on public.perfiles;
create policy perfiles_insert_admin_only
on public.perfiles for insert to authenticated
with check (public.es_admin_actual());

-- Las operaciones de admin y manicurista se conservan como escritura propia o admin.
-- El trigger es la defensa final ante cualquier intento de editar roles por otro medio.
