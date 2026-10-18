-- Descuento aplicado al cobro de un servicio (toggle 10% / 20% en
-- "Registrar Servicio").
--
--   descuento_pct:   porcentaje aplicado (0, 10 o 20; 0 = sin descuento).
--   descuento_monto: monto descontado en pesos.
--
-- `servicios.precio` ya guarda el TOTAL con descuento aplicado; estas
-- columnas solo conservan la información del descuento para mostrarlo en la
-- ficha de consulta de turno/venta.
--
-- Los servicios antiguos quedan con 0 / 0 (sin descuento registrado).

alter table public.servicios
    add column if not exists descuento_pct numeric(5, 2) not null default 0,
    add column if not exists descuento_monto numeric(12, 2) not null default 0;

alter table public.servicios
    drop constraint if exists servicios_descuento_pct_valido;

alter table public.servicios
    add constraint servicios_descuento_pct_valido
    check (descuento_pct >= 0 and descuento_pct <= 100);

alter table public.servicios
    drop constraint if exists servicios_descuento_monto_valido;

alter table public.servicios
    add constraint servicios_descuento_monto_valido
    check (descuento_monto >= 0);
