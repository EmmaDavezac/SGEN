-- Unifica nombres que representan a la misma cliente.
-- Actualiza referencias antes de eliminar duplicados para no perder historicos.

do $$
declare
    canonical_id uuid;
    alias_id uuid;
    mapping record;
begin
    for mapping in
        select * from (values
            ('Eve', 'Eve Luque'),
            ('Mile K', 'Mile Kloster'),
            ('Sonia', 'Sonia Espindola')
        ) as aliases(alias_name, canonical_name)
    loop
        select id into canonical_id
        from public.clientes
        where nombre_normalizado = lower(trim(mapping.canonical_name));

        if canonical_id is null then
            insert into public.clientes (nombre)
            values (mapping.canonical_name)
            returning id into canonical_id;
        end if;

        select id into alias_id
        from public.clientes
        where nombre_normalizado = lower(trim(mapping.alias_name));

        if alias_id is not null and alias_id <> canonical_id then
            update public.turnos set cliente_id = canonical_id where cliente_id = alias_id;
            update public.servicios set cliente_id = canonical_id where cliente_id = alias_id;
            delete from public.clientes where id = alias_id;
        end if;
    end loop;
end;
$$;

select nombre, nombre_normalizado
from public.clientes
where nombre_normalizado in ('eve', 'eve luque', 'mile k', 'mile kloster', 'sonia', 'sonia espindola')
order by nombre_normalizado;