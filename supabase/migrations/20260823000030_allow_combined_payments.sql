-- Cobros combinados: permitir metodo_pago = 'combinado' y guardar el reparto
-- por método en columnas propias del servicio.
--
-- Motivo: la cliente puede pagar parte en efectivo, parte en transferencia y
-- dejar una porción fiada. Antes solo existía un método único por servicio
-- (CHECK: efectivo | transferencia | fiado), así que no había dónde guardar
-- el reparto.
--
--   monto_efectivo / monto_transferencia: porción ya cobrada de cada medio.
--   saldo_pendiente: porción todavía adeudada (fiado parcial). Cobros de fiado
--   puro (metodo_pago = 'fiado') no usan estas columnas: su deuda sigue siendo
--   precio - sena, como hasta ahora.
--
-- `pagos` NO cambia: su CHECK ya admite efectivo/transferencia y el reparto se
-- registra como una fila por cada medio cobrado (el flujo de servicios sin
-- turno no genera filas en pagos, por eso el reparto vive en servicios).

alter table public.servicios
    drop constraint if exists servicios_metodo_pago_valido;

alter table public.servicios
    add constraint servicios_metodo_pago_valido
    check (metodo_pago in ('efectivo', 'transferencia', 'fiado', 'combinado'));

alter table public.servicios
    add column if not exists monto_efectivo numeric(12, 2) not null default 0;

alter table public.servicios
    add column if not exists monto_transferencia numeric(12, 2) not null default 0;

alter table public.servicios
    add column if not exists saldo_pendiente numeric(12, 2) not null default 0;

alter table public.servicios
    drop constraint if exists servicios_reparto_pago_valido;

alter table public.servicios
    add constraint servicios_reparto_pago_valido
    check (monto_efectivo >= 0 and monto_transferencia >= 0 and saldo_pendiente >= 0);
