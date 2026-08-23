-- Pasa servicios desde el staging a la tabla final.
-- Ejecutar despues de importar el CSV en public.import_servicios_csv.
-- Es idempotente por legacy_id y no elimina filas del staging.

insert into public.servicios (
    legacy_id,
    cliente_id,
    usuario_id,
    fecha,
    servicio,
    categoria,
    precio,
    sena,
    metodo_pago,
    completado,
    vuelto
)
select
    source."ID",
    cliente.id,
    perfil.id,
    source."Fecha"::timestamptz,
    nullif(trim(source."Servicio"), ''),
    coalesce(nullif(trim(source."Categoria"), ''), 'Otro'),
    coalesce(nullif(replace(trim(source."Precio"), ',', '.'), '')::numeric, 0),
    coalesce(nullif(replace(trim(source."Seña"), ',', '.'), '')::numeric, 0),
    lower(trim(source."MetodoPago")),
    lower(trim(source."Completado")) in ('si', 'sí', 'yes', 'true'),
    coalesce(nullif(replace(trim(source."Vuelto"), ',', '.'), '')::numeric, 0)
from public.import_servicios_csv source
join public.clientes cliente
    on cliente.nombre_normalizado = case lower(trim(source."Cliente"))
        when 'eve' then 'eve luque'
        when 'mile k' then 'mile kloster'
        when 'sonia' then 'sonia espindola'
        else lower(trim(source."Cliente"))
    end
left join public.perfiles perfil
        on lower(trim(perfil.email)) = lower(trim(source."Usuario"))
where nullif(trim(source."Servicio"), '') is not null
    and lower(trim(source."MetodoPago")) in ('efectivo', 'transferencia', 'fiado')
  and not exists (
      select 1
      from public.servicios existing
    where existing.legacy_id = source."ID"
  );

select
    count(*) as servicios_importados,
    count(*) filter (where metodo_pago = 'fiado') as servicios_fiados,
    count(*) filter (where completado = false) as servicios_pendientes
from public.servicios;
