# Changelog — SGEN

## v1.3.0 — 2026-10-15 (SW v32)

### Cambios
- Regla de negocio: un usuario no puede crear dos `turnos` solapados al mismo tiempo.
  - `saveAppointmentToDatabase` valida antes del `insert` que no exista otro turno (no cancelado) del mismo usuario en la misma fecha con horario solapado, y lanza un error claro si lo hay.
  - `updateAppointmentInDatabase` aplica la misma validación al reagendar, excluyendo el turno que se está editando para que no choque consigo mismo.
- Bump de `CACHE_VERSION` en `public/sw.js` (v31 → v32) para forzar la actualización del service worker en clientes instalados.

### Commits
- (pendiente de commit al cerrar la versión)
