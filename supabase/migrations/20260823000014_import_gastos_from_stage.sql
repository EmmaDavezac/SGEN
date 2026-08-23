-- Importa gastos desde staging a la tabla final.
-- Es idempotente por legacy_id y no elimina el staging.

insert into public.gastos (
    legacy_id,
    usuario_id,
    fecha,
    concepto,
    monto,
    metodo_pago,
    categoria
)
select
    source."ID",
    perfil.id,
    case
        when source."Fecha" ~ '^\d{4}-\d{2}-\d{2}' then left(source."Fecha", 10)::date
        else to_date(split_part(trim(source."Fecha"), ' ', 1), 'DD/MM/YYYY')
    end,
    nullif(trim(source."Concepto"), ''),
    replace(trim(source."Monto"), ',', '.')::numeric,
    lower(trim(source."MetodoPago")),
    coalesce(nullif(trim(source."Categoria"), ''), 'Otro')
from public.import_gastos_csv source
left join public.perfiles perfil
    on lower(trim(perfil.email)) = lower(trim(source."Usuario"))
where nullif(trim(source."Concepto"), '') is not null
  and nullif(trim(source."Monto"), '') is not null
    and replace(trim(source."Monto"), ',', '.')::numeric > 0
  and lower(trim(source."MetodoPago")) in ('efectivo', 'transferencia')
  and not exists (
      select 1
      from public.gastos existing
      where existing.legacy_id = source."ID"
  );

select
    count(*) as gastos_importados,
    coalesce(sum(monto), 0) as total_gastos
from public.gastos;
