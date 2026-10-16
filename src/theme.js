import { BUSINESS, obtenerTema } from './businessConfig.js';

// Claves de localStorage para recordar el tema y el modo elegido por dispositivo.
const TEMA_STORAGE_KEY = 'sgen_tema';
const MODO_STORAGE_KEY = 'sgen_modo';

// Valores posibles de modo: 'claro' | 'oscuro' | 'sistema'
const MODO_SISTEMA = 'sistema';

// Detecta si el dispositivo pide modo oscuro via prefers-color-scheme.
function modoDelDispositivo() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'claro';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

// Resuelve el modo efectivo a aplicar: localStorage > prefers-color-scheme del dispositivo > BUSINESS.modo.
function resolverModo(modoGuardado) {
  if (modoGuardado) {
    return modoGuardado;
  }
  if (modoDelDispositivo() === 'oscuro') {
    return 'oscuro';
  }
  return BUSINESS.modo || 'claro';
}

// Inyecta las variables de color del tema (y modo) como CSS custom properties en :root.
// Así style.css puede seguir usando var(--brand-primary, ...) y el tema activo
// las sobrescribe sin tocar la hoja de estilos. Permite cambiar de tema/modo sin recargar.
// El mismo tema (ej. 'barbie') soporta los modos 'claro' y 'oscuro'.
export function aplicarTema(nombreTema, modo = 'claro') {
  // Resuelve 'sistema' a claro/oscuro según prefers-color-scheme del dispositivo.
  const modoResuelto = modo === MODO_SISTEMA ? modoDelDispositivo() : modo;
  const tema = obtenerTema(nombreTema, modoResuelto);
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

  // Actualiza el theme-color del navegador (barra de direcciones Android y PWA instalada)
  // para que coincida con el color de marca del tema activo.
  // En modo oscuro se usa --surface-bg para que la barra se mezcle con el fondo oscuro
  // del modo oscuro en lugar de forzar el rosa de marca en ambos temas.
  try {
    const esOscuro = modoResuelto === 'oscuro';
    const themeColor = esOscuro
      ? (root.style.getPropertyValue('--surface-bg') || getComputedStyle(root).getPropertyValue('--surface-bg'))
      : (root.style.getPropertyValue('--brand-primary') || getComputedStyle(root).getPropertyValue('--brand-primary'));
    const themeMeta = document.getElementById('theme-color-meta');
    if (themeMeta && themeColor) {
      themeMeta.setAttribute('content', themeColor);
    }
    const iosStyleMeta = document.getElementById('ios-status-bar-style');
    if (iosStyleMeta) {
      iosStyleMeta.setAttribute('content', esOscuro ? 'black' : 'default');
    }
  } catch (e) {
    // Si falla la actualización del meta, se ignora silenciosamente.
  }

  return { nombreTema, modo };
}

// Lee el tema y el modo guardados o los defaults del dispositivo / negocio y los aplica.
// Por defecto respeta prefers-color-scheme del dispositivo.
export function inicializarTema() {
  const guardadoTema = localStorage.getItem(TEMA_STORAGE_KEY) || BUSINESS.tema;
  const guardadoModo = localStorage.getItem(MODO_STORAGE_KEY);
  const modo = resolverModo(guardadoModo);
  return aplicarTema(guardadoTema, modo);
}

// Devuelve el modo actualmente activo ('claro' | 'oscuro' | 'sistema').
export function obtenerModo() {
  try {
    const guardado = localStorage.getItem(MODO_STORAGE_KEY);
    return resolverModo(guardado);
  } catch (e) {
    return resolverModo(null);
  }
}

// Alterna entre 'claro' y 'oscuro' del tema actual y lo aplica.
export function alternarModo(nombreTema = BUSINESS.tema) {
  const actual = obtenerModo();
  const nuevo = actual === 'claro' ? 'oscuro' : 'claro';
  return aplicarTema(nombreTema, nuevo);
}

// Establece el modo explícitamente ('claro' | 'oscuro' | 'sistema') y lo aplica.
export function establecerModo(modo, nombreTema = BUSINESS.tema) {
  return aplicarTema(nombreTema, modo);
}

export { MODO_SISTEMA };

export { obtenerTema };
