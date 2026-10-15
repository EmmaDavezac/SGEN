import { obtenerTema } from './businessConfig.js';

// Claves de localStorage para recordar el tema y el modo elegido por dispositivo.
const TEMA_STORAGE_KEY = 'sgen_tema';
const MODO_STORAGE_KEY = 'sgen_modo';

// Inyecta las variables de color del tema (y modo) como CSS custom properties en :root.
// Así style.css puede seguir usando var(--brand-primary, ...) y el tema activo
// las sobrescribe sin tocar la hoja de estilos. Permite cambiar de tema/modo sin recargar.
// El mismo tema (ej. 'barbie') soporta los modos 'claro' y 'oscuro'.
export function aplicarTema(nombreTema, modo = 'claro') {
  const tema = obtenerTema(nombreTema, modo);
  const root = document.documentElement;

  for (const [propiedad, valor] of Object.entries(tema)) {
    root.style.setProperty(propiedad, valor);
  }

  // Persiste la elección para recargas futuras (opcional; el negocio define el default).
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, nombreTema);
    localStorage.setItem(MODO_STORAGE_KEY, modo);
  } catch (e) {
    // localStorage no disponible en entornos privados/incógnito: se ignora silenciosamente.
  }

  return { nombreTema, modo };
}

// Lee el tema y el modo guardados o los defaults de BUSINESS y los aplica.
export function inicializarTema() {
  const guardadoTema = localStorage.getItem(TEMA_STORAGE_KEY) || BUSINESS.tema;
  const guardadoModo = localStorage.getItem(MODO_STORAGE_KEY) || BUSINESS.modo;
  return aplicarTema(guardadoTema, guardadoModo);
}

// Devuelve el modo actualmente activo ('claro' | 'oscuro').
export function obtenerModo() {
  try {
    return localStorage.getItem(MODO_STORAGE_KEY) || BUSINESS.modo;
  } catch (e) {
    return BUSINESS.modo;
  }
}

// Alterna entre 'claro' y 'oscuro' del tema actual y lo aplica.
export function alternarModo(nombreTema = BUSINESS.tema) {
  const actual = obtenerModo();
  const nuevo = actual === 'claro' ? 'oscuro' : 'claro';
  return aplicarTema(nombreTema, nuevo);
}

export { obtenerTema };
