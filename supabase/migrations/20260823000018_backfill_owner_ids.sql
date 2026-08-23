-- Vincula registros historicos con perfiles de Supabase Auth por email.
-- No modifica importes, fechas, estados ni elimina registros.

update public.turnos as target
set usuario_id = profile.id
from public.perfiles as profile
where target.usuario_id is null
  and lower(trim(target.legacy_id)) is not null
  and lower(trim(profile.email)) = 'mely.janex@gmail.com';

update public.servicios as target
set usuario_id = profile.id
from public.perfiles as profile
where target.usuario_id is null
  and lower(trim(profile.email)) = 'mely.janex@gmail.com';

update public.gastos as target
set usuario_id = profile.id
from public.perfiles as profile
where target.usuario_id is null
  and lower(trim(profile.email)) = 'mely.janex@gmail.com';

update public.pagos as target
set usuario_id = profile.id
from public.perfiles as profile
where target.usuario_id is null
  and lower(trim(profile.email)) = 'mely.janex@gmail.com';

select 'turnos' as tabla, count(*) filter (where usuario_id is not null) as vinculados from public.turnos
union all
select 'servicios', count(*) filter (where usuario_id is not null) from public.servicios
union all
select 'gastos', count(*) filter (where usuario_id is not null) from public.gastos
union all
select 'pagos', count(*) filter (where usuario_id is not null) from public.pagos;
