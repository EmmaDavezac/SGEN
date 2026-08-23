-- Politicas RLS iniciales para la migracion.
-- Lectura compartida durante la transicion; escrituras por propietario o admin.

do $$
declare
    policy_row record;
begin
    for policy_row in
        select * from (values
            ('perfiles', 'perfiles_select_propios'),
            ('clientes', 'clientes_select_autenticados'),
            ('clientes', 'clientes_insert_autenticados'),
            ('clientes', 'clientes_update_autenticados'),
            ('turnos', 'turnos_select_autenticados'),
            ('turnos', 'turnos_insert_propios'),
            ('turnos', 'turnos_update_propios'),
            ('turnos', 'turnos_delete_admin'),
            ('servicios', 'servicios_select_autenticados'),
            ('servicios', 'servicios_insert_propios'),
            ('servicios', 'servicios_update_propios'),
            ('servicios', 'servicios_delete_admin'),
            ('pagos', 'pagos_select_autenticados'),
            ('pagos', 'pagos_insert_propios'),
            ('pagos', 'pagos_update_propios'),
            ('pagos', 'pagos_delete_admin'),
            ('gastos', 'gastos_select_autenticados'),
            ('gastos', 'gastos_insert_propios'),
            ('gastos', 'gastos_update_propios'),
            ('gastos', 'gastos_delete_admin'),
            ('movimientos_caja', 'movimientos_caja_select_autenticados'),
            ('movimientos_caja', 'movimientos_caja_insert_propios'),
            ('movimientos_caja', 'movimientos_caja_update_propios'),
            ('movimientos_caja', 'movimientos_caja_delete_admin'),
            ('precios', 'precios_select_autenticados'),
            ('precios', 'precios_write_admin'),
            ('import_servicios_csv', 'import_servicios_select_admin'),
            ('import_gastos_csv', 'import_gastos_select_admin'),
            ('import_precios_csv', 'import_precios_select_admin')
        ) as policies(table_name, policy_name)
    loop
        execute format(
            'drop policy if exists %I on public.%I',
            policy_row.policy_name,
            policy_row.table_name
        );
    end loop;
end;
$$;

create or replace function public.es_admin_actual()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.perfiles
        where id = auth.uid()
          and rol = 'admin'
    );
$$;

revoke all on function public.es_admin_actual() from public;
grant execute on function public.es_admin_actual() to authenticated;

create policy perfiles_select_propios
on public.perfiles for select to authenticated
using (id = auth.uid() or public.es_admin_actual());

create policy clientes_select_autenticados
on public.clientes for select to authenticated
using (true);

create policy clientes_insert_autenticados
on public.clientes for insert to authenticated
with check (true);

create policy clientes_update_autenticados
on public.clientes for update to authenticated
using (true)
with check (true);

create policy turnos_select_autenticados
on public.turnos for select to authenticated
using (true);

create policy turnos_insert_propios
on public.turnos for insert to authenticated
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy turnos_update_propios
on public.turnos for update to authenticated
using (usuario_id = auth.uid() or public.es_admin_actual())
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy turnos_delete_admin
on public.turnos for delete to authenticated
using (public.es_admin_actual());

create policy servicios_select_autenticados
on public.servicios for select to authenticated
using (true);

create policy servicios_insert_propios
on public.servicios for insert to authenticated
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy servicios_update_propios
on public.servicios for update to authenticated
using (usuario_id = auth.uid() or public.es_admin_actual())
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy servicios_delete_admin
on public.servicios for delete to authenticated
using (public.es_admin_actual());

create policy pagos_select_autenticados
on public.pagos for select to authenticated
using (true);

create policy pagos_insert_propios
on public.pagos for insert to authenticated
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy pagos_update_propios
on public.pagos for update to authenticated
using (usuario_id = auth.uid() or public.es_admin_actual())
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy pagos_delete_admin
on public.pagos for delete to authenticated
using (public.es_admin_actual());

create policy gastos_select_autenticados
on public.gastos for select to authenticated
using (true);

create policy gastos_insert_propios
on public.gastos for insert to authenticated
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy gastos_update_propios
on public.gastos for update to authenticated
using (usuario_id = auth.uid() or public.es_admin_actual())
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy gastos_delete_admin
on public.gastos for delete to authenticated
using (public.es_admin_actual());

create policy movimientos_caja_select_autenticados
on public.movimientos_caja for select to authenticated
using (true);

create policy movimientos_caja_insert_propios
on public.movimientos_caja for insert to authenticated
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy movimientos_caja_update_propios
on public.movimientos_caja for update to authenticated
using (usuario_id = auth.uid() or public.es_admin_actual())
with check (usuario_id = auth.uid() or public.es_admin_actual());

create policy movimientos_caja_delete_admin
on public.movimientos_caja for delete to authenticated
using (public.es_admin_actual());

create policy precios_select_autenticados
on public.precios for select to authenticated
using (true);

create policy precios_write_admin
on public.precios for all to authenticated
using (public.es_admin_actual())
with check (public.es_admin_actual());

create policy import_servicios_select_admin
on public.import_servicios_csv for select to authenticated
using (public.es_admin_actual());

create policy import_gastos_select_admin
on public.import_gastos_csv for select to authenticated
using (public.es_admin_actual());

create policy import_precios_select_admin
on public.import_precios_csv for select to authenticated
using (public.es_admin_actual());
