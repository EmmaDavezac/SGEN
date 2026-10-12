-- Catalogo administrable: las bajas son logicas y conservan precios e historial.
create table if not exists public.categorias_servicio (
    clave text primary key,
    nombre text not null,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint categorias_servicio_clave_valida check (clave ~ '^[a-z0-9_-]+$'),
    constraint categorias_servicio_nombre_no_vacio check (length(trim(nombre)) > 0)
);

create unique index if not exists categorias_servicio_nombre_normalizado_key
    on public.categorias_servicio (lower(trim(nombre)));

alter table public.precios
    add column if not exists activo boolean not null default true;

insert into public.categorias_servicio (clave, nombre)
values
    ('semi', 'Semi'),
    ('kapping', 'Kapping'),
    ('softgel', 'Soft Gel'),
    ('esculpidas', 'Esculpidas'),
    ('remocion', 'Remoción'),
    ('personalizado', 'Otro')
on conflict (clave) do nothing;

insert into public.categorias_servicio (clave, nombre)
select distinct
    precio.categoria,
    initcap(replace(replace(precio.categoria, '_', ' '), '-', ' '))
from public.precios precio
where precio.categoria ~ '^[a-z0-9_-]+$'
on conflict do nothing;

alter table public.categorias_servicio enable row level security;

drop policy if exists categorias_servicio_select_autenticados on public.categorias_servicio;
drop policy if exists categorias_servicio_write_admin on public.categorias_servicio;

create policy categorias_servicio_select_autenticados
on public.categorias_servicio for select to authenticated
using (true);

create policy categorias_servicio_write_admin
on public.categorias_servicio for all to authenticated
using (public.es_admin_actual())
with check (public.es_admin_actual());