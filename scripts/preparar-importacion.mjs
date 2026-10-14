#!/usr/bin/env node
/**
 * preparar-importacion.mjs — Lee los CSVs legacy (carpeta csv/) y genera
 * csv/import_completo.sql: rebuild limpio + repoblado + verificaciones.
 * Uso: node scripts/preparar-importacion.mjs (o npm run generar-importacion)
 * csv/ esta en .gitignore: los datos reales NUNCA se commitean.
 * NO toca perfiles ni auth.users.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV_DIR = path.join(ROOT, "csv");
const OUT_FILE = path.join(CSV_DIR, "import_completo.sql");
const FILES = {
  turnos: "EvoletNails - Turnos.csv",
  servicios: "EvoletNails - Servicios.csv",
  gastos: "EvoletNails - Gastos.csv",
  precios: "EvoletNails - Precios.csv",
  caja: "EvoletNails - CajaMovimientos.csv",
  usuarios: "EvoletNails - Usuarios.csv",
};
const ALIAS_CLIENTAS = { eve: "eve luque", "mile k": "mile kloster", sonia: "sonia espindola" };
const NOMBRES_CANONICOS = { "eve luque": "Eve Luque", "mile kloster": "Mile Kloster", "sonia espindola": "Sonia Espindola" };
const CATEGORIAS_BASE = [
  { clave: "semi", nombre: "Semi" }, { clave: "kapping", nombre: "Kapping" },
  { clave: "softgel", nombre: "Soft Gel" }, { clave: "esculpidas", nombre: "Esculpidas" },
  { clave: "remocion", nombre: "Remoción" }, { clave: "personalizado", nombre: "Otro" },
];
const errores = [];
const advertencias = [];

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = []; let field = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c === "\r") { /* skip */ } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readCsv(name) {
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, name), "utf8"));
  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1).filter((r) => r.some((v) => v.trim() !== ""));
  return { header, data };
}
function toObjects(parsed) {
  return parsed.data.map((row) => {
    const o = {};
    parsed.header.forEach((h, i) => { o[h || "_extra"] = (row[i] ?? "").trim(); });
    return o;
  });
}
function parseMoney(v, ctx) {
  if (v == null || String(v).trim() === "") return null;
  let s = String(v).trim().replace(/\$/g, "").trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) { errores.push(ctx + ": monto invalido '" + v + "'"); return null; }
  return Math.round(n);
}
function parseDate(v, ctx) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  errores.push(ctx + ": fecha invalida '" + v + "'"); return null;
}
function parseTime(v, ctx) {
  const s = String(v ?? "").trim();
  let m = s.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return m[1] + ":" + m[2] + ":" + (m[3] ?? "00");
  m = s.match(/^(?:(\d{4})-(\d{2})-(\d{2}) )?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) { errores.push(ctx + ": hora invalida '" + v + "'"); return null; }
  return String(m[4]).padStart(2, "0") + ":" + m[5] + ":" + (m[6] ?? "00");
}
const normName = (n) => String(n ?? "").trim().toLowerCase();
const stripAccents = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slug = (s) => stripAccents(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "personalizado";
const sqlStr = (v) => (v == null ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const sqlNum = (v) => (v == null ? "null" : String(v));

/* ------------------------- carga de CSVs ------------------------- */
const turnos = toObjects(readCsv(FILES.turnos));
const servicios = toObjects(readCsv(FILES.servicios));
const gastos = toObjects(readCsv(FILES.gastos));
const precios = toObjects(readCsv(FILES.precios));
const caja = toObjects(readCsv(FILES.caja));
const usuarios = toObjects(readCsv(FILES.usuarios));

/* ------------------------- clientes ------------------------- */
const clienteDisplay = new Map();
function registrarCliente(nombreCrudo, ctx) {
  const nombre = String(nombreCrudo ?? "").trim();
  if (!nombre) { errores.push(ctx + ": sin nombre de cliente"); return null; }
  let norm = normName(nombre);
  if (ALIAS_CLIENTAS[norm]) norm = ALIAS_CLIENTAS[norm];
  if (!clienteDisplay.has(norm)) {
    clienteDisplay.set(norm, NOMBRES_CANONICOS[norm] || nombre);
  }
  return norm;
}
turnos.forEach((t, i) => registrarCliente(t.Cliente, "turnos fila " + (i + 2)));
servicios.forEach((s, i) => registrarCliente(s.Cliente, "servicios fila " + (i + 2)));

/* ------------------------- turnos ------------------------- */
const ESTADOS = new Set(["provisional", "reservado", "completado", "cancelado"]);
const turnosOut = [];
const turnosIds = new Set();
turnos.forEach((t, i) => {
  const ctx = "turnos fila " + (i + 2);
  const id = (t.ID || "").trim();
  if (!id) { errores.push(ctx + ": sin ID"); return; }
  if (turnosIds.has(id)) { errores.push(ctx + ": ID duplicado " + id); return; }
  turnosIds.add(id);
  // Fecha: columna propia (ISO, ej 2026-07-30T03:00:00.000Z -> 2026-07-30).
  // Si está vacía, se deriva de HoraInicio como hacía la migración legacy 00004.
  let fecha = String(t.Fecha || "").trim() ? parseDate(t.Fecha, ctx) : null;
  const hiRaw = String(t.HoraInicio || "").trim();
  const hfRaw = String(t.HoraFin || "").trim();
  if (fecha == null && hiRaw) { fecha = parseDate(hiRaw, ctx); advertencias.push(ctx + ": sin Fecha propia, derivada de HoraInicio"); }
  // Los 3 turnos que cruzan medianoche se parten: fin = 23:59:59 del día de inicio
  // (respeta turnos_horario_valido hora_fin > hora_inicio).
  let hi = hiRaw ? parseTime(hiRaw, ctx) : null;
  let hf = hfRaw ? parseTime(hfRaw, ctx) : null;
  let fechaFin = fecha;
  if (fecha && hiRaw && hfRaw) {
    const dIni = parseDate(hiRaw, ctx);
    const dFin = parseDate(hfRaw, ctx);
    if (dIni && dFin && dFin !== dIni) {
      advertencias.push(ctx + ": cruza medianoche, fin recortado a 23:59:59 del " + fecha);
      hf = "23:59:59";
    }
  }
  // El CSV de turnos trae el estado en la columna 10, cuyo encabezado está vacío (cae en t._extra)
  let estado = normName(t._extra) || "provisional";
  if (!ESTADOS.has(estado)) { advertencias.push(ctx + ": estado '" + t._extra + "' -> provisional"); estado = "provisional"; }
  const cliente = registrarCliente(t.Cliente, ctx);
  if (fecha == null || hi == null || hf == null || cliente == null) return;
  const precio = t.Precio === "" ? 0 : parseMoney(t.Precio, ctx);
  if (precio == null) return;
  const email = (t.Usuario || "").trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) advertencias.push(ctx + ": email usuario raro '" + t.Usuario + "'");
  turnosOut.push({ id, fecha, hi, hf, cliente, serv: t.Servicio || null, precio, email, event: t.EventID || null, estado });
});
/* ------------------------- servicios ------------------------- */
const MP = { transferencia: "transferencia", efectivo: "efectivo", fiado: "fiado" };
const serviciosOut = [];
const serviciosIds = new Set();
servicios.forEach((s, i) => {
  const ctx = "servicios fila " + (i + 2);
  const id = (s.ID || "").trim();
  if (!id) { errores.push(ctx + ": sin ID"); return; }
  if (serviciosIds.has(id)) { errores.push(ctx + ": ID duplicado " + id); return; }
  serviciosIds.add(id);
  // Fecha viene como timestamp ISO: extraer solo la fecha para la columna timestamptz ok directo
  const fechaRaw = String(s.Fecha || "").trim();
  const fecha = fechaRaw ? fechaRaw : null;
  if (!fecha) { errores.push(ctx + ": sin fecha"); return; }
  const cliente = registrarCliente(s.Cliente, ctx);
  if (cliente == null) return;
  const nombre = (s.Servicio || "").trim();
  if (!nombre) { errores.push(ctx + ": sin nombre de servicio"); return; }
  const esSena = normName(nombre) === "seña";
  const total = parseMoney(s.Precio, ctx);
  const sena = !s["Seña"] || String(s["Seña"]).trim() === "" ? 0 : parseMoney(s["Seña"], ctx);
  if (total == null || sena == null) return;
  if (sena > total) advertencias.push(ctx + ": seña " + sena + " > total " + total);
  let mp = normName(s.MetodoPago);
  if (!MP[mp]) { advertencias.push(ctx + ": metodo '" + s.MetodoPago + "' -> efectivo"); mp = "efectivo"; }
  const completado = normName(s.Completado) === "si" || normName(s.Completado) === "sí";
  const categoria = (s.Categoria || "").trim() || "personalizado";
  const vuelto = !s.Vuelto || String(s.Vuelto).trim() === "" ? 0 : parseMoney(s.Vuelto, ctx);
  const email = (s.Usuario || "").trim().toLowerCase() || null;
  serviciosOut.push({ id, fecha, cliente, nombre, categoria, total, sena, mp, completado, vuelto: vuelto ?? 0, email, esSena });
});

/* -------- pagos derivados (mig 00012): seña + cobro -------- */
const pagosOut = [];
const conSenia = new Set(
  serviciosOut.filter((s) => !s.esSena && s.sena > 0).map((s) => normName(clienteDisplay.get(s.cliente) + "|" + s.nombre + "|" + s.fecha + "|" + s.total))
);
serviciosOut.forEach((s) => {
  if (s.esSena) return;
  // pagos.metodo_pago solo admite efectivo/transferencia: fiado nunca genera pagos
  if (s.mp === "fiado") { advertencias.push("servicios " + s.id + ": fiado sin cobro derivado (" + clienteDisplay.get(s.cliente) + ")"); return; }
  const key = normName(clienteDisplay.get(s.cliente) + "|" + s.nombre + "|" + s.fecha + "|" + s.total);
  if (conSenia.has(key) && s.sena === 0) return; // fila cobro ya cubierta
  if (s.sena > 0 && s.completado) pagosOut.push({ sid: s.id, tipo: "sena", monto: s.sena, mp: s.mp, fecha: s.fecha, email: s.email });
  if (s.completado && s.total > s.sena) pagosOut.push({ sid: s.id, tipo: "cobro", monto: s.total - s.sena, mp: s.mp, fecha: s.fecha, email: s.email });
  if (!s.completado) advertencias.push("servicios " + s.id + ": pendiente, sin pago derivado (" + clienteDisplay.get(s.cliente) + ")");
});
/* ------------------------- gastos ------------------------- */
const gastosOut = [];
const gastosIds = new Set();
gastos.forEach((g, i) => {
  const ctx = "gastos fila " + (i + 2);
  const id = (g.ID || "").trim();
  if (!id) { errores.push(ctx + ": sin ID"); return; }
  if (gastosIds.has(id)) { errores.push(ctx + ": ID duplicado " + id); return; }
  gastosIds.add(id);
  const fecha = parseDate(g.Fecha, ctx);
  const monto = parseMoney(g.Monto, ctx);
  if (fecha == null || monto == null) return;
  let mp = normName(g.MetodoPago);
  if (mp !== "efectivo" && mp !== "transferencia") { advertencias.push(ctx + ": metodo '" + g.MetodoPago + "' -> efectivo"); mp = "efectivo"; }
  gastosOut.push({ id, fecha, desc: (g.Concepto || "").trim(), monto, mp, email: (g.Usuario || "").trim().toLowerCase() || null, cat: (g.Categoria || "").trim() || "Otro" });
});

/* ------------------------- precios ------------------------- */
const preciosOut = [];
precios.forEach((p, i) => {
  const ctx = "precios fila " + (i + 2);
  const nombre = ((p.Nombre ?? p.Servicio) || "").trim();
  const monto = parseMoney(p.Precio, ctx);
  if (!nombre) { errores.push(ctx + ": sin nombre"); return; }
  if (monto == null) return;
  preciosOut.push({ nombre, monto, extra: ((p.Categoria ?? p.Categoria) || "").trim() || null });
});

/* ------------------------- caja ------------------------- */
const cajaOut = [];
caja.forEach((m, i) => {
  const ctx = "caja fila " + (i + 2);
  if (!m.Fecha && !m.Monto && !m.Concepto) return;
  const fecha = parseDate(m.Fecha, ctx);
  const monto = parseMoney(m.Monto, ctx);
  if (fecha == null || monto == null) return;
  let tipo = normName(m.Tipo);
  if (tipo === "extraccion") tipo = "retiro";
  if (tipo !== "ingreso" && tipo !== "retiro") { advertencias.push(ctx + ": tipo '" + m.Tipo + "' -> retiro"); tipo = "retiro"; }
  let mp = normName(m.MetodoPago);
  if (!MP[mp]) { advertencias.push(ctx + ": metodo '" + m.MetodoPago + "' -> efectivo"); mp = "efectivo"; }
  cajaOut.push({ fecha, tipo, concepto: (m.Concepto || "").trim(), monto, mp });
});

/* ------------------------- usuarios (solo rol) ------------------------- */
const usuariosOut = usuarios
  .map((u) => ({ email: (u.Email || u.Usuario || "").trim().toLowerCase(), rol: normName(u.Rol) === "manicurista" ? "manicurista" : "admin" }))
  .filter((u) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email));
/* ------------------------- categorias derivadas ------------------------- */
const categoriasOut = [...CATEGORIAS_BASE];
const clavesConocidas = new Set(categoriasOut.map((c) => c.clave));
for (const s of serviciosOut) {
  const clave = slug(s.categoria);
  if (!clavesConocidas.has(clave)) { clavesConocidas.add(clave); categoriasOut.push({ clave, nombre: s.categoria }); }
}

/* ------------------------- validación final ------------------------- */
if (errores.length) {
  console.error("\nERRORES (" + errores.length + "):");
  for (const e of errores.slice(0, 40)) console.error("  x " + e);
  console.error("\nCorregí los CSVs y reintentá. No se generó ningún archivo.");
  process.exit(1);
}

/* ------------------------- generación SQL ------------------------- */
const L = [];
const push = (s = "") => L.push(s);
push("-- import_completo.sql — generado por scripts/preparar-importacion.mjs");
push("-- Rebuild limpio de datos de negocio. NO toca perfiles ni auth.users.");
push("begin;");
push("truncate public.pagos, public.servicios, public.turnos, public.gastos, public.movimientos_caja, public.precios, public.clientes restart identity cascade;");
push("delete from public.categorias_servicio where clave not in ('semi','kapping','softgel','esculpidas','remocion','personalizado');");
push("");
push("-- Categorías");
for (const c of categoriasOut) {
  push("insert into public.categorias_servicio (clave, nombre) values (" + sqlStr(c.clave) + ", " + sqlStr(c.nombre) + ") on conflict (clave) do update set nombre = excluded.nombre;");
}
push("");
push("-- Clientes");
for (const [norm, display] of [...clienteDisplay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  push("insert into public.clientes (nombre) values (" + sqlStr(display) + ");");
}
push("");
push("-- Turnos");
for (const t of turnosOut) {
  const uid = t.email ? "(select id from public.perfiles where lower(email) = " + sqlStr(t.email) + ")" : "null";
  push("insert into public.turnos (legacy_id, cliente_id, usuario_id, fecha, hora_inicio, hora_fin, servicio, precio, estado, event_id) values (" +
    sqlStr(t.id) + ", (select id from public.clientes where nombre_normalizado = " + sqlStr(t.cliente) + "), " + uid + ", " +
    sqlStr(t.fecha) + ", " + sqlStr(t.fecha + "T" + t.hi + "Z") + ", " + sqlStr(t.fecha + "T" + t.hf + "Z") + ", " +
    sqlStr(t.serv) + ", " + sqlNum(t.precio) + ", " + sqlStr(t.estado) + ", " + sqlStr(t.event) + ");");
}
push("");
push("-- Servicios");
for (const s of serviciosOut) {
  const uid = s.email ? "(select id from public.perfiles where lower(email) = " + sqlStr(s.email) + ")" : "null";
  push("insert into public.servicios (legacy_id, cliente_id, usuario_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto) values (" +
    sqlStr(s.id) + ", (select id from public.clientes where nombre_normalizado = " + sqlStr(s.cliente) + "), " + uid + ", " +
    sqlStr(s.fecha) + ", " + sqlStr(s.nombre) + ", " + sqlStr(slug(s.categoria)) + ", " + sqlNum(s.total) + ", " + sqlNum(s.sena) +
    ", " + sqlStr(s.mp) + ", " + (s.completado ? "true" : "false") + ", " + sqlNum(s.vuelto) + ");");
}
push("");
push("-- Pagos derivados");
for (const p of pagosOut) {
  const uid = p.email ? "(select id from public.perfiles where lower(email) = " + sqlStr(p.email) + ")" : "null";
  push("insert into public.pagos (legacy_id, servicio_id, usuario_id, fecha, monto, metodo_pago, tipo) values (" +
    sqlStr("imp:" + p.sid + ":" + p.tipo) + ", (select id from public.servicios where legacy_id = " + sqlStr(p.sid) + "), " + uid + ", " + sqlStr(p.fecha) + ", " +
    sqlNum(p.monto) + ", " + sqlStr(p.mp) + ", " + sqlStr(p.tipo) + ");");
}
push("");
push("-- Gastos");
for (const g of gastosOut) {
  const uid = g.email ? "(select id from public.perfiles where lower(email) = " + sqlStr(g.email) + ")" : "null";
  push("insert into public.gastos (legacy_id, usuario_id, fecha, concepto, monto, metodo_pago, categoria) values (" +
    sqlStr(g.id) + ", " + uid + ", " + sqlStr(g.fecha) + ", " + sqlStr(g.desc) + ", " + sqlNum(g.monto) + ", " + sqlStr(g.mp) + ", " + sqlStr(g.cat) + ");");
}
push("");
push("-- Movimientos de caja");
for (const m of cajaOut) {
  push("insert into public.movimientos_caja (fecha, tipo, monto, concepto, origen, destino) values (" +
    sqlStr(m.fecha) + ", " + sqlStr(m.tipo) + ", " + sqlNum(m.monto) + ", " + sqlStr(m.concepto) + ", 'caja', 'caja');");
}
if (!cajaOut.length) push("-- (hoja CajaMovimientos vacía: sin movimientos)");
push("");
push("-- Precios");
for (const p of preciosOut) {
  const cat = slug(p.extra || p.nombre);
  if (!clavesConocidas.has(cat)) {
    clavesConocidas.add(cat);
    push("insert into public.categorias_servicio (clave, nombre) values (" + sqlStr(cat) + ", " + sqlStr(p.extra || p.nombre) + ") on conflict (clave) do nothing;");
  }
  push("insert into public.precios (categoria, nombre, precio) values (" + sqlStr(cat) + ", " + sqlStr(p.nombre) + ", " + sqlNum(p.monto) + ") on conflict (categoria, nombre) do update set precio = excluded.precio;");
}
push("");
push("-- Roles (update sobre perfiles existentes; jamás crea ni borra cuentas)");
for (const u of usuariosOut) {
  push("update public.perfiles set rol = " + sqlStr(u.rol) + " where lower(email) = " + sqlStr(u.email) + ";");
}
push("");
push("-- Verificaciones");
push("select 'clientes' as tabla, count(*) from public.clientes");
push("union all select 'turnos', count(*) from public.turnos");
push("union all select 'servicios', count(*) from public.servicios");
push("union all select 'pagos', count(*) from public.pagos");
push("union all select 'gastos', count(*) from public.gastos");
push("union all select 'movimientos_caja', count(*) from public.movimientos_caja");
push("union all select 'precios', count(*) from public.precios");
push("union all select 'categorias_servicio', count(*) from public.categorias_servicio order by 1;");
push("select estado, count(*) from public.turnos group by estado order by 1;");
push("select count(*) as turnos_sin_cliente from public.turnos t where not exists (select 1 from public.clientes c where c.id = t.cliente_id);");
push("select count(*) as servicios_sin_cliente from public.servicios s where not exists (select 1 from public.clientes c where c.id = s.cliente_id);");
push("select 'servicios' as tabla, count(*) as sin_perfil from public.servicios where usuario_id is null union all select 'gastos', count(*) from public.gastos where usuario_id is null;");
push("commit;");
fs.writeFileSync(OUT_FILE, L.join("\n") + "\n");

/* ------------------------- reporte ------------------------- */
const fusiones = Object.entries(ALIAS_CLIENTAS).filter(([a]) => clienteDisplay.has(a));
console.log("\n=== Importación generada: csv/import_completo.sql ===");
console.log("Tamaño: " + (fs.statSync(OUT_FILE).size / 1024).toFixed(1) + " KB (datos reales: no commitear)");
console.log("clientes: " + clienteDisplay.size + " | turnos: " + turnosOut.length + " | servicios: " + serviciosOut.length +
  " | pagos: " + pagosOut.length + " | gastos: " + gastosOut.length + " | caja: " + cajaOut.length +
  " | precios: " + preciosOut.length + " | categorias: " + categoriasOut.length);
console.log("roles a actualizar: " + (usuariosOut.map((u) => u.email).join(", ") || "ninguno"));
if (fusiones.length) for (const [a, c] of fusiones) console.log("fusión: " + a + " -> " + clienteDisplay.get(c));
if (advertencias.length) {
  console.log("Advertencias (" + advertencias.length + "):");
  for (const a of advertencias.slice(0, 30)) console.log("  ! " + a);
}
console.log("Pasos: 1) aplicar mig 00028 en SQL Editor  2) ejecutar csv/import_completo.sql  3) revisar verificaciones");
