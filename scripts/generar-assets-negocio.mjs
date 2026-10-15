/**
 * generar-assets-negocio.mjs
 *
 * Regenera los activos estáticos cuyo contenido depende del nombre del negocio
 * (index.html, 404.html, public/manifest.json) a partir de src/businessConfig.js.
 *
 * Uso:
 *   node scripts/generar-assets-negocio.mjs
 *
 * Al cambiar de negocio solo hay que editar src/businessConfig.js (BUSINESS.nombre)
 * y volver a ejecutar el build. Este script se encarga de dejar los archivos
 * estáticos sincronizados sin tocar componentes React ni el CSS.
 */

import { BUSINESS } from '../src/businessConfig.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const NOMBRE_POR_DEFECTO = 'Evolet Studio';
const nombreNegocio = BUSINESS.nombre || NOMBRE_POR_DEFECTO;

const ARCHIVOS = [
  'index.html',
  '404.html',
  'public/manifest.json',
];

let cambios = 0;

for (const ruta of ARCHIVOS) {
  if (!existsSync(ruta)) {
    console.warn(`[generar-assets-negocio] no existe: ${ruta}`);
    continue;
  }
  let contenido = readFileSync(ruta, 'utf8');
  const antes = contenido;
  // Reemplaza el nombre por defecto del repo por el nombre del negocio activo.
  contenido = contenido.split(NOMBRE_POR_DEFECTO).join(nombreNegocio);

  if (contenido !== antes) {
    writeFileSync(ruta, contenido, 'utf8');
    cambios++;
    console.log(`[generar-assets-negocio] actualizado: ${ruta} (Evolet Studio → ${nombreNegocio})`);
  }
}

if (cambios === 0) {
  console.log(`[generar-assets-negocio] nada que cambiar (negocio: ${nombreNegocio}).`);
}
