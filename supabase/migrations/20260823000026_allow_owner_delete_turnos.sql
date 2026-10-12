-- Permitir que manicurista elimine sus propios turnos (provisional/reservado sin seña).
-- La regla de negocio (sin seña, no completado) se valida en frontend + Edge;
-- RLS solo garantiza que sea dueno o admin para borrar la fila.
drop policy if exists turnos_delete_admin on public.turnos;

create policy turnos_delete_owner_or_admin
on public.turnos for delete to authenticated
using (usuario_id = auth.uid() or public.es_admin_actual());
