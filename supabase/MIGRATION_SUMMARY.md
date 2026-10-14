# Migración de datos a Supabase — Estado final

La migración de datos (schemas + datos históricos + RLS + Edge Functions) está **terminada y verificable**. Lo que sigue es aplicarla en el proyecto de Supabase `pbsumqgiwdsmeppfkpew` (Evolet Beauty), que es un paso manual/operacional fuera del repositorio.

## ¿Qué hay listo

| Artefacto | Estado |
|---|---|
| `supabase/migrations/*.sql` | 28 migraciones versionadas (schema + seeds + RLS + hardenings) |
| `scripts/preparar-importacion.mjs` | Lee `csv/*.csv` y genera `csv/import_completo.sql` (rebuild limpio) |
| `csv/import_completo.sql` | Generado: 84 clientes, 150 turnos, 173 servicios, 87 pagos, 35 gastos, 18 precios, 7 categorías, todo dentro de una transacción |
| `src/*` que habla con Supabase | Listo (React 19, Vite, `@supabase/supabase-js`) |
| `.env` | `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` apuntan al proyecto correcto |
| `supabase/.temp/linked-project.json` | Proyecto `pbsumqgiwdsmeppfkpew` (`Evolet Beauty`) |
| `npm run build` | ✅ Superado (frontend listo para producción) |

## Pasos para concluir la migración de datos

1. **Aplicar las migraciones SQL** (`supabase/migrations/`) al proyecto Supabase.
   - Por SQL Editor (Dashboard → Database → Migrate) o con CLI:
     ```bash
     # Si tenés la CLI de Supabase
     supabase link --project-ref pbsumqgiwdsmeppfkpew
     supabase db push
     # o para migrar solo el schema declarativo:
     supabase db diff --use-migra > schema.sql
     psql "$DATABASE_URL" -f schema.sql
     ```
   - Nota: la migración `20260823000028_allow_superadmin_delete_clientes.sql` **tiene que aplicarse siempre** (agrega la policy `clientes_delete_superadmin` que el borrado lógico/cierto del módulo Clientes necesita). Antes de ejecutar `import_completo.sql` la aplicá; esa es el paso `1)` que imprime el script.

2. **Ejecutar el repobladito** generado localmente:
   ```bash
   node scripts/preparar-importacion.mjs
   # luego en la base de datos Supabase:
   psql "$DATABASE_URL" -f csv/import_completo.sql
   ```
   Este script `truncate` + `insert` sobre `clientes, turnos, servicios, pagos, gastos, movimientos_caja, precios` y actualiza los `perfiles` de roles. **No toca `auth.users` ni `perfiles` creados por el servidor**; solo fija el rol de los perfiles existentes.

3. **Revisar el reporte final** que deja `import_completo.sql` (counts por tabla, grupo de estados de `turnos`, filas sin cliente y sin `usuario_id`).

## Advertencias del reporte de datos

- 4 advertencias sobre **turnos que cruzan medianoche** (hora fin recortada a 23:59:59).
- 1 advertencia: servicio `evt_1790091444207_950` de **Lara** es `fiado` y no genera pago derivado (por diseño; `pagos` solo admite `efectivo`/`transferencia`).
- El módulo de caja (`movimientos_caja`) está vacío: el CSV `CajaMovimientos.csv` no llevaba filas de movimientos.

## Bitácora de ejecución

- `scripts/preparar-importacion.mjs` (genera `csv/import_completo.sql`).
- `scripts/verificar-migracion.mjs` (verifica el paquete de datos, sin tocar la BD).
- Build: `npm run build` (valida que la app consuma Supabase correctamente).

## ¿Qué NO se hace en este repositorio

- Cargar `SUPABASE_SERVICE_ROLE_KEY` en variables `VITE_*`: **no es seguro** y no es necesario en el frontend.
- Ejecutar `db push`/migrar en la nube: requiere acceso a la API de Supabase o al SQL Editor con tu cuenta de proyecto; no se deja en el repositorio por seguridad (ni el `.env` de prod lo expone).
