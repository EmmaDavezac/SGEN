-- Permite que cada usuaria actualice sus propios datos de perfil.
drop policy if exists perfiles_update_propios on public.perfiles;
create policy perfiles_update_propios
on public.perfiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());
