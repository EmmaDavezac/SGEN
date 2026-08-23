-- Reconstruye estados porque el CSV historico de Turnos no tenia Estado.
-- Regla conservadora: pasado con precio > 0 = completado; futuro con precio > 0 = reservado.
-- Los turnos sin precio quedan provisionales. No elimina ni modifica pagos.

update public.turnos
set estado = case
    when fecha < current_date and precio > 0 then 'completado'
    when fecha >= current_date and precio > 0 then 'reservado'
    else 'provisional'
end,
actualizado_en = now()
where estado = 'provisional';

select
    estado,
    count(*) as cantidad
from public.turnos
group by estado
order by estado;
