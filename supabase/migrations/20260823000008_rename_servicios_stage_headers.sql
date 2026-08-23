-- Adapta una tabla staging ya creada a los encabezados exactos del CSV.
-- Ejecutar solo si 00006 ya fue ejecutada antes de importar el CSV.

alter table if exists public.import_servicios_csv rename column id to "ID";
alter table if exists public.import_servicios_csv rename column fecha to "Fecha";
alter table if exists public.import_servicios_csv rename column usuario to "Usuario";
alter table if exists public.import_servicios_csv rename column cliente to "Cliente";
alter table if exists public.import_servicios_csv rename column servicio to "Servicio";
alter table if exists public.import_servicios_csv rename column categoria to "Categoria";
alter table if exists public.import_servicios_csv rename column precio to "Precio";
alter table if exists public.import_servicios_csv rename column sena to "Seña";
alter table if exists public.import_servicios_csv rename column metodo_pago to "MetodoPago";
alter table if exists public.import_servicios_csv rename column completado to "Completado";
alter table if exists public.import_servicios_csv rename column vuelto to "Vuelto";
