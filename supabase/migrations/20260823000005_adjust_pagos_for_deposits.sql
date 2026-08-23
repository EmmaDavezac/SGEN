-- Ajusta pagos para representar correctamente senas y cobros finales.
-- Una sena puede existir antes de que se realice el servicio.

alter table public.pagos
    alter column servicio_id drop not null;

alter table public.pagos
    drop constraint if exists pagos_debe_referenciar_turno_o_servicio;

alter table public.pagos
    add constraint pagos_debe_referenciar_turno_o_servicio
    check (turno_id is not null or servicio_id is not null);

comment on column public.pagos.turno_id is 'Turno relacionado; obligatorio para una sena y recomendado para todo cobro.';
comment on column public.pagos.servicio_id is 'Servicio relacionado; puede ser null cuando el pago es una sena anticipada.';
comment on column public.servicios.sena is 'Campo histórico de compatibilidad. Los nuevos pagos deben registrarse en pagos.';
