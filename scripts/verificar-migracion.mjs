#!/usr/bin/env node
/**
 * verificar-migracion.mjs — Valida que el paquete de datos de la migración
 * esté completo y consistente con el esquema del proyecto Supabase.
 *
 * Uso: node scripts/verificar-migracion.mjs
 *
 * No toca la base de datos. Solo revisa los artefactos locales:
 *  - csv/*.csv (fuentes originales)
 *  - csv/import_completo.sql (paquete generado por preparar-importacion.mjs)
 *  - .env (variables VITE_* de Supabase)
 *
 * La deuda de migración: el SQL en import_completo.sql es el que se ejecuta
 * en la base de datos de Supabase (ver SUPABASE_DATABASE.md).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_DIR = path.join(ROOT, 'csv');
const OUT_FILE = path.join(CSV_DIR, 'import_completo.sql');
const ENV_FILE = path.join(ROOT, '.env');

const errores = [];
const advertencias = [];

function leerArchivo(ruta) {
  try {
    return fs.readFileSync(ruta, 'utf8');
  } catch (err) {
    errores.push(`No se pudo leer ${ruta}: ${err.message}`);
    return null;
  }
}

function parseCsvCount(texto) {
  const normalize = (s) => s.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  const s = normalize(texto);
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else { q = false; }
      } else { field += c; }
    } else if (c === '"') { q = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c === '\r') { /* salto */ }
    else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.length - 1; // restamos header
}

/* 1. CSV fuente */
const csvs = {
  turnos: path.join(CSV_DIR, 'EvoletNails - Turnos.csv'),
  servicios: path.join(CSV_DIR, 'EvoletNails - Servicios.csv'),
  gastos: path.join(CSV_DIR, 'EvoletNails - Gastos.csv'),
  precios: path.join(CSV_DIR, 'EvoletNails - Precios.csv'),
};
for (const [name, ruta] of Object.entries(csvs)) {
  const n = parseCsvCount(leerArchivo(ruta) || '');
  if (n === -1) errores.push(`CSV ${name}: no leíble`);
  else console.log(`  CSV ${name}: ${n} filas`);
}

/* 2. Paquete import_completo.sql */
const sql = leerArchivo(OUT_FILE);
if (sql === null) {
  errores.push('import_completo.sql no leíble');
} else {
  const cnt = (patron) => (sql.match(new RegExp(patron, 'g')) || []).length;
  const ins = cnt('insert into public');
  console.log(`  import_completo.sql: ${ins} inserciones`);
  if (!/^\s*begin\s*;$/m.test(sql)) errores.push('import_completo.sql: no empieza con "begin;"');
  if (!/^\s*commit\s*;$/m.test(sql)) errores.push('import_completo.sql: no termina con "commit;"');
}

/* 3. Entorno VITE */
const envText = leerArchivo(ENV_FILE);
if (envText !== null) {
  const url = envText.match(/^VITE_SUPABASE_URL=(.*)$/m);
  const anon = envText.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m);
  if (!url || !url[1].startsWith('https://')) {
    errores.push('VITE_SUPABASE_URL no válido');
  } else {
    console.log(`  VITE_SUPABASE_URL: ${url[1]}`);
  }
  if (!anon || !anon[1].startsWith('sb_publishable_')) {
    advertencias.push('VITE_SUPABASE_PUBLISHABLE_KEY no es una clave publishable');
  } else {
    console.log('  VITE_SUPABASE_PUBLISHABLE_KEY: presente (clave publishable, segura en frontend)');
  }
} else {
  errores.push('.env no leíble');
}

/* 4. Resumen final */
console.log('\n=== Resultado de verificación ===');
if (errores.length) {
  console.error(`\n❌ Errores (${errores.length}):`);
  for (const e of errores) console.error(`  - ${e}`);
} else {
  console.log('\n✅ El paquete de datos está consistente y listo para aplicarse.');
}
if (advertencias.length) {
  console.log(`\n⚠️  Advertencias (${advertencias.length}):`);
  for (const a of advertencias) console.log(`  - ${a}`);
}
process.exit(errores.length > 0 ? 1 : 0);
