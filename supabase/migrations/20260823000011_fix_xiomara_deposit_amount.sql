-- Corrige una seña exportada como 9 cuando el importe real era 9000.
-- Solo actualiza el registro esperado y no modifica otros importes.

update public.import_servicios_csv
set "Seña" = '9000'
where "ID" = 'evt_1786760314270_261'
  and trim("Seña") = '9';

update public.servicios
set sena = 9000
where legacy_id = 'evt_1786760314270_261'
  and sena = 9;

select legacy_id, precio, sena, cliente_id
from public.servicios
where legacy_id = 'evt_1786760314270_261';
