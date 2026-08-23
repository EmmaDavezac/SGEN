-- Core schema for the Supabase migration.
-- Historical CSV data is not modified by this migration.

-- A repeated normalized name identifies the same client in the current business rules.
drop index if exists public.clientes_nombre_normalizado_idx;
create unique index if not exists clientes_nombre_normalizado_key
    on public.clientes (nombre_normalizado);

create table if not exists public.perfiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    nombre text not null,
    rol text not null default 'manicurista',
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint perfiles_rol_valido check (rol in ('admin', 'manicurista'))
);

create table if not exists public.turnos (
    id uuid primary key default gen_random_uuid(),
    legacy_id text unique,
    cliente_id uuid not null references public.clientes(id),
    usuario_id uuid references public.perfiles(id),
    fecha date not null,
    hora_inicio timestamptz not null,
    hora_fin timestamptz not null,
    servicio text not null default 'Turno',
    precio numeric(12, 2) not null default 0,
    estado text not null default 'provisional',
    event_id text,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint turnos_horario_valido check (hora_fin > hora_inicio),
    constraint turnos_precio_valido check (precio >= 0),
    constraint turnos_estado_valido check (estado in ('provisional', 'reservado', 'completado', 'cancelado'))
);

create table if not exists public.servicios (
    id uuid primary key default gen_random_uuid(),
    legacy_id text unique,
    cliente_id uuid not null references public.clientes(id),
    turno_id uuid references public.turnos(id),
    usuario_id uuid references public.perfiles(id),
    fecha timestamptz not null default now(),
    servicio text not null,
    categoria text not null default 'Otro',
    precio numeric(12, 2) not null default 0,
    sena numeric(12, 2) not null default 0,
    metodo_pago text not null,
    completado boolean not null default false,
    vuelto numeric(12, 2) not null default 0,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint servicios_precio_valido check (precio >= 0),
    constraint servicios_sena_valida check (sena >= 0 and sena <= precio),
    constraint servicios_vuelto_valido check (vuelto >= 0),
    constraint servicios_metodo_pago_valido check (metodo_pago in ('efectivo', 'transferencia', 'fiado'))
);

create table if not exists public.pagos (
    id uuid primary key default gen_random_uuid(),
    legacy_id text unique,
    servicio_id uuid not null references public.servicios(id),
    turno_id uuid references public.turnos(id),
    usuario_id uuid references public.perfiles(id),
    fecha timestamptz not null default now(),
    monto numeric(12, 2) not null,
    metodo_pago text not null,
    tipo text not null default 'cobro',
    creado_en timestamptz not null default now(),
    constraint pagos_monto_valido check (monto > 0),
    constraint pagos_metodo_pago_valido check (metodo_pago in ('efectivo', 'transferencia')),
    constraint pagos_tipo_valido check (tipo in ('sena', 'cobro', 'ajuste'))
);

create table if not exists public.gastos (
    id uuid primary key default gen_random_uuid(),
    legacy_id text unique,
    usuario_id uuid references public.perfiles(id),
    fecha date not null,
    concepto text not null,
    monto numeric(12, 2) not null,
    metodo_pago text not null,
    categoria text not null default 'Otro',
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint gastos_monto_valido check (monto > 0),
    constraint gastos_metodo_pago_valido check (metodo_pago in ('efectivo', 'transferencia'))
);

create table if not exists public.movimientos_caja (
    id uuid primary key default gen_random_uuid(),
    legacy_id text unique,
    usuario_id uuid references public.perfiles(id),
    fecha date not null,
    tipo text not null,
    monto numeric(12, 2) not null,
    concepto text not null,
    origen text not null,
    destino text not null,
    creado_en timestamptz not null default now(),
    constraint movimientos_caja_tipo_valido check (tipo in ('deposito', 'retiro')),
    constraint movimientos_caja_monto_valido check (monto > 0)
);

create table if not exists public.precios (
    id uuid primary key default gen_random_uuid(),
    categoria text not null,
    nombre text not null,
    precio numeric(12, 2) not null default 0,
    actualizado_por uuid references public.perfiles(id),
    actualizado_en timestamptz not null default now(),
    constraint precios_precio_valido check (precio >= 0),
    constraint precios_categoria_nombre_key unique (categoria, nombre)
);

create index if not exists turnos_cliente_fecha_idx on public.turnos (cliente_id, fecha);
create index if not exists turnos_estado_idx on public.turnos (estado);
create index if not exists servicios_cliente_fecha_idx on public.servicios (cliente_id, fecha desc);
create index if not exists servicios_turno_idx on public.servicios (turno_id);
create index if not exists pagos_servicio_idx on public.pagos (servicio_id, fecha desc);
create index if not exists gastos_fecha_idx on public.gastos (fecha desc);
create index if not exists movimientos_caja_fecha_idx on public.movimientos_caja (fecha desc);

alter table public.perfiles enable row level security;
alter table public.turnos enable row level security;
alter table public.servicios enable row level security;
alter table public.pagos enable row level security;
alter table public.gastos enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.precios enable row level security;
