-- Tabla temporal de staging para importar el CSV de Servicios desde Supabase Table Editor.
-- No modifica servicios ni clientes existentes.

create table if not exists public.import_servicios_csv (
    "ID" text primary key,
    "Fecha" text,
    "Usuario" text,
    "Cliente" text,
    "Servicio" text,
    "Categoria" text,
    "Precio" text,
    "Seña" text,
    "MetodoPago" text,
    "Completado" text,
    "Vuelto" text
);

alter table public.import_servicios_csv enable row level security;

comment on table public.import_servicios_csv is 'Staging temporal para importar EvoletNails - Servicios.csv; se puede vaciar despues de validar.';
