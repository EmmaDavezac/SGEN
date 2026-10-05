# 💅 Evolet Nails | Sistema Integral de Gestión & Contabilidad para Salón de Uñas

> **PWA Full-Stack en producción** · React 19 · Supabase (PostgreSQL · Auth · Edge Functions) · Vite · Diseño Y2K Pink / Mobile-First

Solución SaaS de uso interno pensada para **Evolet Nails**, un salón de uñas en Argentina que necesitaba **unificar en un solo lugar** toda la información dispersa (agenda de turnos, servicios cobrados, fiados pendientes, gastos, precios y caja diaria) — eliminando planillas manuales y papel, y permitiendo contabilidad real sin errores de transcripción.

Todo fluye desde la **toma del turno** → **registro del servicio** → **cobro** → **historial** → **KPIs de cierre de mes**. Multi-rol: dueña/admin y manicureras con permisos segmentados.

---

## 🎯 Problema que resuelve

Antes de este sistema, la operación del salón sufría estos dolores:

| Dolor | Solución integrada |
|---|---|
| 📒 Agenda en papel + WhatsApp → turnos superpuestos o perdidos | Calendario mensual sincronizado opcionalmente con Google Calendar |
| 💵 Cobros anotados a mano → caja chica desalineada al cierre | Registro pormenorizado con 3 métodos de pago + fiado + vuelto calculado |
| 🧾 Fiados dispersos → deudoras olvidadas | Panel de fiados pendientes + cobro integrado en Historial |
| 📊 Cuadre mensual manual en Excel (3 horas) | KPIs automáticos: ingresos, gastos, neto, ticket promedio, deudoras, % por categoría |
| 🏷 Precios sin catálogo → cada empleada cobra distinto | Catálogo oficial editable por admin solo |
| 👩 Clientas sin ficha → no hay historial de repetición | Ficha individual por clienta con turnos + servicios históricos |
| 📱 Todo en una PC del local → no se puede revisar desde casa | **PWA instalable en celular** de cada empleada, con acceso según rol |

---

## ✨ Funcionalidades (en producción)

| Módulo | Qué hace |
|---|---|
| 🔐 **Autenticación multi-rol** | Inicio de sesión por email + contraseña (Supabase Auth). Dos perfiles: `admin` (dueña) y `usuaria` (manicurera). |
| 📅 **Agenda de turnos** | Vista mensual + detalle diario. Agendar, reagendar, cancelar y **registrar seña para reservar**. Integración **opcional bidireccional con Google Calendar** vía Supabase Edge Function (turnos aparecen también en el calendario del salón). |
| ➕ **Registrar Servicio** | Formulario mobile-first. Categorías predefinidas (Semi, Kapping, Soft Gel, Esculpidas, Remoción, Personalizado), clienta existente o nueva, métodos de pago (Transferencia · Efectivo · Fiado), cálculo automático de seña descontada y vuelto, retiro previo externo. |
| 🎟 **Ticket compartible por WhatsApp** | Al registrar se genera un ticket estilizado en `<canvas>` → exporta PNG → usa **Web Share API** con fallback de descarga para enviar por WhatsApp directo a la clienta. |
| 📜 **Historial de ventas** | Filtros por período · categoría · método de pago. Cobro de fiados pendientes inline. Eliminación lógica de registros reservada solo a admin. |
| 💳 **Gastos** | Registro y listado de egresos del salón (insumos, alquiler, servicios) con categoría y método. |
| 📊 **Panel de Estadísticas** | KPIs: Ingresos brutos, Gastos, Fiados pendientes, **Balance neto**, Ticket promedio. Distribución % por categoría de servicio y listado de clientas deudoras ordenado por mayor deuda. |
| 👩 **Gestión de Clientas** | Alta, edición, activar / desactivar y baja lógica. Ficha individual con historial de turnos y servicios prestados a cada clienta. |
| 🏷 **Catálogo de Precios** *(solo admin)* | Lista oficial editable de servicios y sus precios. Persistida en PostgreSQL. |
| 🏦 **Gestión de Cajas** *(solo admin, flag opcional)* | Consolidado en tiempo real de Efectivo vs Mercado Pago + movimientos manuales (depósitos / extracciones) con trazabilidad. |
| ⚙️ **Ajustes locales** *(solo admin)* | Toggles: habilitar fiado, mostrar/ocultar pestaña Registrar, habilitar módulo Cajas. Guardados en `localStorage` por dispositivo. |
| 👤 **Mi Cuenta** | Edición de perfil propio, actualización de email (con re-verificación) y cambio seguro de contraseña con re-autenticación. |
| 📱 **Progressive Web App** | Instalable como app nativa en Android e iOS. Modo standalone, 8 tamaños de íconos PWA, maskable, splash screen iOS. Service Worker con precache de assets para uso offline. |

---

## 🛠 Stack tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19 (hooks estándar, sin librerías de estado) · Vite 5 · CSS global con tokens Y2K Pink |
| **Autenticación** | Supabase Auth (email + contraseña, perfiles extendidos en `perfiles`) |
| **Base de datos** | PostgreSQL en **Supabase** · **RLS (Row Level Security)** activado por tabla |
| **Integraciones** | Supabase **Edge Function** en TypeScript que habla con Google Calendar API (OAuth 2.0 secrets almacenados en Supabase Secrets — nunca expuestos al cliente) |
| **PWA / Offline** | `vite-plugin-pwa` con estrategia `injectManifest` y Service Worker custom |
| **Formato / Moneda** | `es-AR` · `ARS` en todos los módulos |

---

## 🏗️ Arquitectura general

```
                            ┌───────────────────────────────────────────────────┐
                            │           CLIENTE MÓVIL (PWA INSTALADA)          │
                            │    React 19 · Componentes JSX · Routing por Tabs  │
                            │                                                    │
                            │  App.jsx (estado global, guards de rol, notify)   │
                            └───────┬───────────────────────────┬───────────────┘
                                    │ Supabase JS SDK v2          │ HTTPS endpoint
                                    │ REST + Auth                 │ Edge Function
                                    ▼                             ▼
                      ┌──────────────────────┐        ┌──────────────────────────────┐
                      │  SUPABASE PLATFORM   │        │  Google Calendar Edge (TS)    │
                      │                      │        │                              │
                      │  ┌────────────────┐  │        │  Secrets almacenados:         │
                      │  │  PostgreSQL    │  │        │  GOOGLE_CLIENT_ID / SECRET    │
                      │  │  con RLS ON    │  │        │  GOOGLE_REFRESH_TOKEN        │
                      │  │                │  │        │  GOOGLE_CALENDAR_ID          │
                      │  │ perfiles       │  │        │                              │
                      │  │ clientes       │  │        │  Acciones: CREATE / UPDATE   │
                      │  │ turnos         │  │        │  / DELETE → Google Calendar  │
                      │  │ servicios      │  │        │  y persiste `turnos.event_id` │
                      │  │ pagos          │  │        └──────────────────────────────┘
                      │  │ gastos         │  │
                      │  │ precios        │  │
                      │  │ mov_caja       │  │
                      │  └────────────────┘  │
                      └──────────────────────┘
```

### Seguridad por diseño (defensa en profundidad)
1. **Nivel UI** (no es suficiente pero ayuda):
   - Gate superior: `{!session ? <Login/> : <AppLayout/>}`
   - `useEffect` de redirect ante cualquier tab inválido / no autorizado
   - Render condicional `{isAdmin && <Panel/>}`
2. **Nivel DB** (el verdadero muro):
   - **RLS activo en TODAS las tablas**
   - Usuaria normal solo ve `WHERE owner_id = auth.uid()` — no puede leer ni modificar datos de otra empleada
   - **Admin** tiene política `USING (true)` / `WITH CHECK (true)`
   - Secrets de Google Calendar **viven en Supabase**, el frontend no los toca

---

## 🧠 Decisiones de diseño destacadas (el porqué del código)

1. **Sin React Router**  
   La app es 100% mobile-first con navegación inferior tipo Instagram / WhatsApp. Nadie del staff comparte links internos del sistema; cada persona entra y toca tabs. Routing por URL agregaba complejidad sin valor para el caso de uso, así que los "guards" se implementaron con un `useEffect` + whitelist (`isValidTab()`) — más simple, menos KB, menos superficie de bugs.

2. **Turnos sin columna `sena` (seña) en la tabla**  
   Un turno "Reservado" **almacena temporalmente** el monto de seña en la columna `turnos.precio`, y paralelamente se escribe un registro en `pagos` con `tipo = 'sena'`. Así mantenemos el registro contable formal en `pagos` sin desnormalizar. Al cobrarse el servicio completo, la seña se descuenta automáticamente del total.

3. **Tickets compartibles por Canvas + Web Share**  
   No usamos PDFs (demasiado peso para WhatsApp mobile). En su lugar: el mismo HTML del ticket de la UI se replica pixel-perfect en un `<canvas>` con la lógica de dibujo pura, se exporta a PNG y se comparte nativamente por el share sheet del teléfono. Fallback silencioso: si el navegador no soporta Web Share, descarga el PNG directo.

4. **PWA con `injectManifest` (no `generateSW`)**  
   El service worker es custom y se inyecta en build time, permitiendo control fino del precache (relevante para que las manicurerias puedan consultar el historial incluso con mala conexión en el salón).

---

## 🗂️ Estructura del proyecto

```
SGEN/
├── docs/archive/legacy/          # Fuentes antiguas conservadas fuera de la app React
├── public/                       # Assets servidos como /
│   ├── icons/                    # 8 tamaños de íconos PWA (favicon, maskable, Apple)
│   ├── logo.png                  # Logo del salón (Login · Header · 404)
│   ├── manifest.json             # Manifiesto PWA (name, colors, icons)
│   └── sw.js                     # Service Worker fuente (VitePWA lo inyecta luego)
├── src/                          # Código React (entry point: react-main.jsx)
│   ├── components/               # UI modular, 1 archivo ≈ 1 pantalla
│   │   ├── AppLayout.jsx         #   Layout global (header + nav inferior)
│   │   ├── CalendarBoard.jsx     #   Agenda calendario mensual
│   │   ├── HistoryPanel.jsx      #   Historial + cobro de fiados
│   │   ├── RegisterServiceForm.jsx # Alta de servicio / cobro
│   │   ├── ClientsPanel.jsx      #   ABM + fichas de clientas
│   │   ├── StatsPanel.jsx        #   KPIs + distribuciones
│   │   ├── ExpensesPanel.jsx     #   Gestión de gastos
│   │   ├── PricesPanel.jsx       #   Catálogo admin
│   │   ├── CashBoxesPanel.jsx    #   Cajas (admin flag)
│   │   ├── SettingsPanel.jsx     #   Ajustes toggles admin
│   │   ├── TicketCanvas.jsx      #   Render Canvas ticket PNG
│   │   ├── Modal.jsx · Toast.jsx · Loader.jsx · Button.jsx
│   ├── App.jsx                   # Orquestador: estado global, guards, notify
│   ├── supabase.js               # Singleton Supabase + signInWithSupabase
│   ├── config.js                 # Lectura de variables VITE_*
│   ├── services.js               # Helpers servicios
│   ├── ui/loader.js · ui/toast.js
│   └── react-main.jsx            # createRoot → <App/>
├── supabase/
│   ├── migrations/               # 22 migraciones SQL ordenadas (0 → 21)
│   ├── queries/                  # Auxiliares (preview de pagos)
│   └── functions/
│       └── google-calendar/      # Edge Function TS (Google Calendar sync)
│           ├── index.ts
│           └── README.md         # Setup OAuth + secrets
├── .env.example                  # Plantilla variables obligatorias
├── .gitignore
├── 404.html                      # Página 404 a nivel host (SPA)
├── index.html                    # Entry SPA → monta #react-root
├── package.json · package-lock.json
├── style.css                     # CSS global · design tokens Y2K Pink
└── vite.config.js                # Config Vite 5 + VitePWA (injectManifest)
```

---

## 🚀 Puesta en marcha local

### Requisitos
- Node.js ≥ 18
- npm
- Un proyecto nuevo en [Supabase](https://supabase.com/)

### 1. Instalar dependencias
```bash
npm install
```

### 2. Variables de entorno
```bash
cp .env.example .env
```
Editar `.env`:
```env
# Obligatorias
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxx
```

> ⚠️ Regla de seguridad de Supabase: **nunca** poner `SUPABASE_SERVICE_ROLE_KEY` en variables `VITE_*` (son públicas). Solo la `PUBLISHABLE_KEY`.

### 3. Aplicar el schema a la base de datos
Aplicar las migraciones versionadas de `supabase/migrations/` desde el SQL Editor de Supabase Dashboard o por CLI. Antes de ejecutar migraciones de importación, revisar el snapshot incluido y confirmar que corresponde a los datos que se desean cargar:
```bash
supabase link  --project-ref TU-PROYECTO
supabase db push
```
Esto crea tablas (`perfiles`, `clientes`, `turnos`, `servicios`, `pagos`, `gastos`, `precios`, `movimientos_caja`) y aplica las políticas RLS. El proceso no modifica Google Sheets.

### 4. (Opcional) Sincronización con Google Calendar
1. Crear OAuth Client ID en Google Cloud Console con scope `https://www.googleapis.com/auth/calendar.events`.
2. Cargar estos Secrets en Supabase → Edge Functions: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`.
3. Deployar el Edge Function:
   ```bash
   supabase functions deploy google-calendar
   ```
Ver `supabase/functions/google-calendar/README.md` para el paso a paso del flujo OAuth.

### 5. Correr en desarrollo
```bash
npm run dev
# abrir http://localhost:5173
```

### 6. Build producción + preview
```bash
npm run build        # output listo para deployar en /dist
npm run preview      # probar el build como si fuera prod
```

El build es 100% static-friendly (Vercel, Netlify, Cloudflare Pages, etc.).

---

## 📋 Scripts

| Comando | Acción |
|---|---|
| `npm run dev`     | Servidor Vite de desarrollo con HMR. |
| `npm run build`   | Build de producción + inyecta Service Worker PWA en `dist/`. |
| `npm run preview` | Preview local del build producido. |

---

## 👩💻 Créditos

Diseñado y desarrollado **end-to-end** con 💖 por **Emmanuel Davezac** —  
Análisis del problema del salón, modelado de base de datos PostgreSQL + RLS, Supabase Edge Function para Google Calendar, frontend React mobile-first y PWA.

Para **Evolet Nails** · Córdoba, Argentina 🇦🇷
