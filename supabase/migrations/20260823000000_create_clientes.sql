create extension if not exists pgcrypto;

create table if not exists public.clientes (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    nombre_normalizado text generated always as (
        lower(trim(nombre))
    ) stored,
    telefono text,
    email text,
    notas text,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint clientes_nombre_no_vacio check (length(trim(nombre)) > 0)
);

create index if not exists clientes_nombre_normalizado_idx
    on public.clientes (nombre_normalizado);

create index if not exists clientes_activos_idx
    on public.clientes (activo)
    where activo = true;

create or replace function public.actualizar_clientes_actualizado_en()
returns trigger
language plpgsql
as $$
begin
    new.actualizado_en = now();
    return new;
end;
$$;

drop trigger if exists clientes_actualizar_timestamp on public.clientes;
create trigger clientes_actualizar_timestamp
before update on public.clientes
for each row
execute function public.actualizar_clientes_actualizado_en();

alter table public.clientes enable row level security;

comment on table public.clientes is 'Clientes de Evolet Nails; entidad maestra para relacionar turnos, servicios y pagos.';
comment on column public.clientes.nombre_normalizado is 'Nombre en minusculas y sin espacios laterales para evitar duplicados basicos.';
