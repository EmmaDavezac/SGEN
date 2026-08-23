-- Staging para importar EvoletNails - Gastos.csv desde Supabase Table Editor.

create table if not exists public.import_gastos_csv (
    "ID" text primary key,
    "Fecha" text,
    "Concepto" text,
    "Monto" text,
    "MetodoPago" text,
    "Usuario" text,
    "Categoria" text
);

alter table public.import_gastos_csv enable row level security;

comment on table public.import_gastos_csv is 'Staging temporal para importar gastos historicos desde CSV.';
