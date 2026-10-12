-- Corrige la autorizacion del trigger para permitir las actualizaciones autorizadas
-- desde la Edge Function mediante service_role.

create or replace function public.proteger_roles_perfiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Las operaciones autorizadas por la Edge Function usan service_role y no tienen
    -- un auth.uid() de usuario. La validacion de superadmin ocurre antes del UPDATE.
    if current_setting('role', true) = 'service_role' then
        return NEW;
    end if;

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
