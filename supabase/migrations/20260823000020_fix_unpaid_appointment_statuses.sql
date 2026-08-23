-- Estos turnos tienen un precio cargado, pero todavía no fueron cobrados.
-- Deben seguir visibles como pendientes y no como turnos completados.

update public.turnos
set estado = 'provisional',
    actualizado_en = now()
where legacy_id in (
    'app_1785764143765_499', -- Abril, 03/08
    'app_1787172014471_674', -- Sonia Espindola, 20/08
    'app_1786148918395_160'  -- Lara, 19/08
);