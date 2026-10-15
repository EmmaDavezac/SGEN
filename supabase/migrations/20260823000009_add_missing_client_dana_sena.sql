-- Conserva la cliente exacta usada por un servicio historico que no pudo mapearse.
-- No se asume que Dana y Dana seña sean la misma persona.

insert into public.clientes (nombre)
values ('Dana seña')
on conflict (nombre_normalizado) do nothing;

select id, nombre
from public.clientes
where nombre_normalizado = 'dana seña';
