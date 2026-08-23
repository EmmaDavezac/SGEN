-- Importa pagos historicos sin contar dos veces las filas antiguas de Seña.
-- No elimina servicios ni filas del staging.

alter table public.servicios
    add column if not exists es_legacy_sena boolean not null default false;

update public.servicios
set es_legacy_sena = true
where lower(trim(servicio)) in ('seña', 'sena');

-- Filas historicas Seña que no tienen un servicio final con una sena declarada.
-- Se conservan como servicio legacy y tambien quedan representadas en pagos.
insert into public.pagos (
    legacy_id,
    servicio_id,
    turno_id,
    usuario_id,
    fecha,
    monto,
    metodo_pago,
    tipo
)
select
    sena_service.legacy_id || ':sena',
    sena_service.id,
    null,
    sena_service.usuario_id,
    sena_service.fecha,
    sena_service.precio,
    sena_service.metodo_pago,
    'sena'
from public.servicios sena_service
where sena_service.es_legacy_sena
  and sena_service.completado
  and sena_service.precio > 0
  and sena_service.metodo_pago <> 'fiado'
  and not exists (
      select 1
      from public.servicios final_service
      where final_service.cliente_id = sena_service.cliente_id
        and not final_service.es_legacy_sena
        and final_service.completado
        and final_service.sena > 0
  )
  and not exists (
      select 1
      from public.pagos existing
      where existing.legacy_id = sena_service.legacy_id || ':sena'
  );

-- Seña declarada en el servicio final.
insert into public.pagos (
    legacy_id,
    servicio_id,
    turno_id,
    usuario_id,
    fecha,
    monto,
    metodo_pago,
    tipo
)
select
    final_service.legacy_id || ':sena',
    final_service.id,
    null,
    final_service.usuario_id,
    final_service.fecha,
    final_service.sena,
    final_service.metodo_pago,
    'sena'
from public.servicios final_service
where not final_service.es_legacy_sena
  and final_service.completado
  and final_service.sena > 0
  and final_service.metodo_pago <> 'fiado'
  and not exists (
      select 1
      from public.pagos existing
      where existing.legacy_id = final_service.legacy_id || ':sena'
  );

-- Cobro restante del servicio final.
insert into public.pagos (
    legacy_id,
    servicio_id,
    turno_id,
    usuario_id,
    fecha,
    monto,
    metodo_pago,
    tipo
)
select
    final_service.legacy_id || ':cobro',
    final_service.id,
    null,
    final_service.usuario_id,
    final_service.fecha,
    final_service.precio - final_service.sena,
    final_service.metodo_pago,
    'cobro'
from public.servicios final_service
where not final_service.es_legacy_sena
  and final_service.completado
  and final_service.precio > final_service.sena
  and final_service.metodo_pago <> 'fiado'
  and not exists (
      select 1
      from public.pagos existing
      where existing.legacy_id = final_service.legacy_id || ':cobro'
  );

select
    count(*) as pagos_importados,
    count(*) filter (where tipo = 'sena') as senas_importadas,
    count(*) filter (where tipo = 'cobro') as cobros_importados,
    coalesce(sum(monto), 0) as total_importado
from public.pagos;
