-- Importa precios desde staging a la tabla final.
-- Es repetible: actualiza el precio de la misma categoria y nombre.

insert into public.precios (
    categoria,
    nombre,
    precio
)
select
    lower(trim(source."Categoria")),
    trim(source."Nombre"),
    replace(trim(source."Precio"), ',', '.')::numeric
from public.import_precios_csv source
where nullif(trim(source."Categoria"), '') is not null
  and nullif(trim(source."Nombre"), '') is not null
  and replace(trim(source."Precio"), ',', '.')::numeric >= 0
on conflict (categoria, nombre)
    do update set
        precio = excluded.precio,
        actualizado_en = now();

select categoria, nombre, precio
from public.precios
order by categoria, nombre;
