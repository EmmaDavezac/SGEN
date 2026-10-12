-- Razon por la que se cancela un turno.
--
-- Cancelar es distinto de eliminar: el turno deja de estar activo pero queda
-- como registro (con su seña y su historial) y se puede consultar despues.
-- Eliminar borra la fila y solo aplica a provisionales.
--
-- La politica existente turnos_update_propios (20260823000017) ya autoriza el
-- UPDATE a la duena del turno o a una admin, asi que no hace falta tocar RLS.

alter table public.turnos
    add column if not exists motivo_cancelacion text;

comment on column public.turnos.motivo_cancelacion is
    'Razon cargada al cancelar el turno. Null salvo que estado = cancelado.';
