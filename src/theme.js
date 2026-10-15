import { obtenerTema } from './businessConfig.js';

// Clave de localStorage para recordar el tema elegido por el negocio/dispositivo.
const TEMA_STORAGE_KEY = 'sgen_tema';

// Inyecta las variables de color del tema como CSS custom properties en :root.
// Así style.css puede seguir usando var(--brand-primary, ...) y el tema activo
// las sobrescribe sin tocar la hoja de estilos. Permite cambiar de tema sin recargar.
export function aplicarTema(nombreTema) {
  const tema = obtenerTema(nombreTema);
  const root = document.documentElement;

  for (const [propiedad, valor] of Object.entries(tema)) {
    root.style.setProperty(propiedad, valor);
  }

  // Persiste la elección para recargas futuras (opcional; el negocio define el default).
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, nombreTema);
  } catch (e) {
    // localStorage no disponible en entornos privados/incógnito: se ignora silenciosamente.
  }

  return nombreTema;
}

// Lee el tema guardado o el default de BUSINESS y lo aplica.
export function inicializarTema() {
  const guardado = localStorage.getItem(TEMA_STORAGE_KEY);
  return aplicarTema(guardado || BUSINESS.tema);
}

export { obtenerTema };
