-- Staging para importar EvoletNails - Precios.csv desde Supabase Table Editor.

create table if not exists public.import_precios_csv (
    "Categoria" text not null,
    "Nombre" text not null,
    "Precio" text not null
);

alter table public.import_precios_csv enable row level security;

comment on table public.import_precios_csv is 'Staging temporal para importar precios historicos desde CSV.';
