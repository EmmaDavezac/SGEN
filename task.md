# Tareas de Implementación: Parche en Confirmación de Turno, Cobro y Permisos de Cancelación

- [x] Modificar Lógica Frontend (`app.js`)
  - [x] Evitar error en `handleSenaSubmit` al no encontrar el dropdown `#sena-modal-status`
  - [x] Blindar formateo con `toLocaleString()` de `apt.precio` utilizando conversión segura `Number() || 0`
  - [x] Ocultar visualmente el botón de eliminar turno (`btn-delete-appointment`) en `renderDayAppointments` para usuarias no admin
  - [x] Agregar chequeo de seguridad en `cancelAppointment` por rol de administrador
- [x] Validación y Verificación
  - [x] Correr `npm run build`
  - [x] Documentar cambios en `walkthrough.md`

## Pendiente: Integración con Google Calendar

- [ ] Crear una Supabase Edge Function para Google Calendar
  - [ ] Configurar OAuth y secretos en Supabase; nunca exponerlos en el frontend
  - [ ] Crear evento al guardar un turno y persistir `turnos.event_id`
  - [ ] Actualizar evento al reagendar
  - [ ] Eliminar evento al cancelar
  - [ ] Manejar reintentos si Calendar falla sin perder el turno en Supabase
- [ ] Mantener el frontend limitado a llamar la Edge Function
- [ ] Probar creación, edición y cancelación de eventos

## Plan retomable: migración del frontend a React

### Fase 0: Preparación

- [x] Crear una rama de trabajo para React (`feature/react-migration`)
- [ ] Confirmar que la versión vanilla actual compila con `npm run build`
- [ ] No borrar `app.js` ni `index.html` hasta completar la migración
- [ ] Mantener Supabase como backend y fuente única de datos

### Fase 1: Base React

- [x] Instalar `react` y `react-dom`
- [x] Crear `src/react-main.jsx` y `src/App.jsx`
- [x] Mantener Vite como herramienta de build
- [x] Mantener `src/supabase.js` como cliente único de Supabase
- [ ] Montar la pantalla React mínima en una entrada aislada y comprobar el build

### Fase 2: Componentes compartidos

- [ ] Crear `src/components/Modal.jsx`
- [ ] Crear `src/components/Button.jsx`
- [ ] Crear `src/components/Loader.jsx`
- [ ] Crear `src/components/Toast.jsx`
- [ ] Crear `src/components/AppLayout.jsx`
- [ ] Migrar estilos reutilizables sin cambiar todavía la apariencia

### Fase 3: Migración por módulos

- [ ] Migrar autenticación y sesión
- [ ] Migrar agenda y turnos
- [ ] Migrar servicios y cobro de fiados
- [ ] Migrar gastos
- [ ] Migrar estadísticas
- [ ] Migrar precios y configuración
- [ ] Migrar movimientos de caja

### Fase 4: Validación por módulo

- [ ] Ejecutar `npm run build` después de cada módulo
- [ ] Verificar lectura y escritura en las tablas Supabase
- [ ] Probar permisos de administradora y usuaria normal
- [ ] Probar estados de carga, error y datos vacíos
- [ ] Probar vista móvil y PWA

### Fase 5: Limpieza y cierre

- [ ] Comparar React con la versión vanilla en un entorno de prueba
- [ ] Confirmar que no existan llamadas a Google Sheets
- [ ] Eliminar código vanilla duplicado solo después de validar todo
- [ ] Actualizar documentación y comandos de ejecución

### Punto de recuperación

Si se interrumpe el trabajo, continuar desde el primer checkbox `[ ]` de esta sección. Antes de editar, leer solo el módulo indicado y ejecutar su validación correspondiente.
