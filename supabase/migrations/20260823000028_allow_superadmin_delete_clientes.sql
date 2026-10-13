-- La serie de policies inicial (20260823000017) creó SELECT/INSERT/UPDATE
-- sobre public.clientes pero NUNCA una policy de DELETE. Sin policy, RLS
-- convierte el DELETE en 0 filas afectadas sin devolver error: la app veía
-- éxito, quitaba la clienta de la UI y, al recargar, reaparecía porque en la
-- tabla seguía existiendo. Se habilita el borrado definitivo únicamente para
-- el superadmin (mismo criterio de la UI: "Solo el superadmin puede eliminar
-- clientas"), usando la función es_superadmin_actual() de la migración 24.
drop policy if exists clientes_delete_superadmin on public.clientes;

create policy clientes_delete_superadmin
on public.clientes for delete to authenticated
using (public.es_superadmin_actual());