-- Permitir a cualquier sesion autenticada actualizar turnos.
--
-- La matriz de negocio (GUIA_VISUAL.md) permite confirmar, cobrar, cancelar y
-- reagendar a cualquier sesion logueada; solo Eliminar es restringido y esa
-- politica (turnos_delete_owner_or_admin, migracion 0026) NO se toca.
--
-- Con la politica anterior (usuario_id = auth.uid() or es_admin_actual()) una
-- manicurista no podia confirmar ni cobrar un turno creado por la admin: RLS
-- devolvia 0 filas SIN error y la app mostraba "No se encontró el turno para
-- actualizar" (confirmar) o cobraba el servicio pero el turno seguia
-- 'reservado' (el update silenciado de finalizeRegisteredService).
--
-- Lectura ya era compartida (turnos_select_autenticados: using (true)).

drop policy if exists turnos_update_propios on public.turnos;

create policy turnos_update_authenticated
on public.turnos for update to authenticated
using (true)
with check (true);
