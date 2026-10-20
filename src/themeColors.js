// Resuelve los colores reales (valores RGB/hex) según el tema y modo actual.
// Usado por canvas/TicketCanvas.jsx que NO puede usar var(--...) porque Canvas
// no interpreta variables CSS: aquí se leen TEMAS (Barbie o el tema activo)
// y se devuelven los hex directos.

import { BUSINESS, TEMAS } from './businessConfig.js';

const MODOS_VALIDOS = ['claro', 'oscuro', 'superoscuro'];

function obtenerModoFinal(modo = BUSINESS.modo) {
  return MODOS_VALIDOS.includes(modo) ? modo : 'claro';
}

function extraerColores(objeto) {
  const result = {};
  if (!objeto) return result;
  for (const [clave, valor] of Object.entries(objeto)) {
    const clean = clave.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    result[clean] = valor;
  }
  return result;
}

export function obtenerTemaColores(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  const clave = TEMAS[nombreTema] ? nombreTema : 'barbie';
  const modoFinal = obtenerModoFinal(modo);
  const tema = TEMAS[clave] || TEMAS.barbie;
  const colores = tema[modoFinal];

  if (colores) return extraerColores(colores);

  // Fallback: tema sin modo → usar oscuro, claro o el tema mismo.
  return extraerColores(tema.oscuro || tema.claro || tema);
}

export function getBrandPrimary(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  return obtenerTemaColores(nombreTema, modo).brandPrimary;
}

export function getBrandDark(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  return obtenerTemaColores(nombreTema, modo).brandDark;
}

export function getTextColor(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  return obtenerTemaColores(nombreTema, modo).textColor;
}

export function getTextMuted(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  return obtenerTemaColores(nombreTema, modo).textMuted;
}

export function getTextLight(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  return obtenerTemaColores(nombreTema, modo).textLight;
}

export function getColorDanger(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  return obtenerTemaColores(nombreTema, modo).colorDanger;
}
