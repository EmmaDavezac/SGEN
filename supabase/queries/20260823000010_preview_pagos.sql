-- Vista previa de pagos historicos. Esta consulta no modifica ninguna tabla.
-- Revisar el resultado antes de ejecutar una importacion definitiva.

with service_rows as (
    select
        s.id as servicio_id,
        s.legacy_id,
        s.cliente_id,
        s.fecha,
        s.servicio,
        s.precio,
        s.sena,
        s.metodo_pago,
        s.completado,
        c.nombre as cliente
    from public.servicios s
    join public.clientes c on c.id = s.cliente_id
), payment_candidates as (
    -- Las filas historicas llamadas Seña representan un ingreso anticipado.
    select
        servicio_id,
        legacy_id,
        cliente_id,
        cliente,
        fecha,
        servicio,
        'sena'::text as tipo,
        precio as monto,
        metodo_pago,
        'fila historica Seña'::text as origen
    from service_rows
    where lower(servicio) in ('seña', 'sena')
      and completado
      and precio > 0
      and metodo_pago <> 'fiado'

    union all

    -- En un servicio final, la columna Seña representa un pago anticipado.
    select
        servicio_id,
        legacy_id,
        cliente_id,
        cliente,
        fecha,
        servicio,
        'sena'::text as tipo,
        sena as monto,
        metodo_pago,
        'columna Seña del servicio final'::text as origen
    from service_rows
    where lower(servicio) not in ('seña', 'sena')
      and completado
      and sena > 0
      and metodo_pago <> 'fiado'

    union all

    -- El saldo de un servicio final es el cobro restante.
    select
        servicio_id,
        legacy_id,
        cliente_id,
        cliente,
        fecha,
        servicio,
        'cobro'::text as tipo,
        greatest(precio - sena, 0) as monto,
        metodo_pago,
        'saldo del servicio final'::text as origen
    from service_rows
    where lower(servicio) not in ('seña', 'sena')
      and completado
      and precio > sena
      and metodo_pago <> 'fiado'
)
select
    cliente,
    fecha,
    servicio,
    tipo,
    monto,
    metodo_pago,
    origen,
    legacy_id
from payment_candidates
where monto > 0
order by fecha, cliente, tipo;

-- Casos potencialmente duplicados: la misma clienta tiene una fila Seña y un servicio
-- final con columna Seña. Revisarlos antes de importar pagos definitivos.
select
    c.nombre as cliente,
    count(*) filter (where lower(s.servicio) in ('seña', 'sena')) as filas_sena,
    count(*) filter (where lower(s.servicio) not in ('seña', 'sena') and s.sena > 0) as servicios_con_sena
from public.servicios s
join public.clientes c on c.id = s.cliente_id
where s.completado
  and s.metodo_pago <> 'fiado'
group by c.id, c.nombre
having count(*) filter (where lower(s.servicio) in ('seña', 'sena')) > 0
   and count(*) filter (where lower(s.servicio) not in ('seña', 'sena') and s.sena > 0) > 0
order by c.nombre;
