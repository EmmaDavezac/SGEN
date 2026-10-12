-- Adapta una tabla staging ya creada a los encabezados exactos del CSV.
-- Ejecutar solo si 00006 ya fue ejecutada antes de importar el CSV.

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'id'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'ID'
    ) then
        execute 'alter table public.import_servicios_csv rename column id to "ID"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'fecha'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Fecha'
    ) then
        execute 'alter table public.import_servicios_csv rename column fecha to "Fecha"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'usuario'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Usuario'
    ) then
        execute 'alter table public.import_servicios_csv rename column usuario to "Usuario"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'cliente'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Cliente'
    ) then
        execute 'alter table public.import_servicios_csv rename column cliente to "Cliente"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'servicio'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Servicio'
    ) then
        execute 'alter table public.import_servicios_csv rename column servicio to "Servicio"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'categoria'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Categoria'
    ) then
        execute 'alter table public.import_servicios_csv rename column categoria to "Categoria"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'precio'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Precio'
    ) then
        execute 'alter table public.import_servicios_csv rename column precio to "Precio"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'sena'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Seña'
    ) then
        execute 'alter table public.import_servicios_csv rename column sena to "Seña"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'metodo_pago'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'MetodoPago'
    ) then
        execute 'alter table public.import_servicios_csv rename column metodo_pago to "MetodoPago"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'completado'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Completado'
    ) then
        execute 'alter table public.import_servicios_csv rename column completado to "Completado"';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'vuelto'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'import_servicios_csv'
          and column_name = 'Vuelto'
    ) then
        execute 'alter table public.import_servicios_csv rename column vuelto to "Vuelto"';
    end if;
end $$;
