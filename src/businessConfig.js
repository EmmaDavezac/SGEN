// Configuración específica del negocio (white-label).
// Para portear SGEN a otro salón solo se edita este archivo (y se añaden temas aquí si se desea).
// Los identificadores de esquema de Supabase y la lógica de producto NO se tocan.

export const BUSINESS = {
  // Identificador interno del negocio (se usa para prefijar claves de localStorage, etc.)
  id: 'evolet-studio',

  // Nombre visible del negocio (aparece en header, footer, meta, manifest, tickets, etc.)
  nombre: 'Evolet Studio',

  // Descripción corta y larga del negocio
  descripcion: 'Sistema de contabilidad y registro de servicios',
  descripcionCorta: 'Contabilidad y registro de servicios',

  // Logo por defecto (se puede sobrescibir por tema)
  logo: '/icons/favicon.svg?v=2',

  // Moneda del negocio
  moneda: 'ARS',
  monedaSimbolo: '$',

  // Tema activo por defecto. Debe coincidir con una clave de TEMAS.
  tema: 'barbie',

  // Modo de apariencia por defecto: 'claro' | 'oscuro'.
  // Se recuerda por dispositivo y se puede alternar desde el menú de cuenta.
  modo: 'claro',

  // Textos configurables del negocio (no son strings de interfaz genérica).
  // Se accede como BUSINESS.textos.<clave> y se pueden interpolar con {{nombre}}.
  textos: {
    bienvenida: 'Bienvenido a {{nombre}}',
    sobre: 'App de contabilidad y registro de servicios para tu negocio.',
    desarrolladoPor: 'Emmanuel Davezac',
    developedBy: 'Desarrollado por',
  },
};

// Temas disponibles. Cada clave define las CSS custom properties que se inyectan en :root.
// Para añadir un tema nuevo basta con agregar una entrada aquí y seleccionarla en BUSINESS.tema.
export const TEMAS = {
  barbie: {
    claro: {
      /* Paleta de marca */
      '--brand-primary': '#FF69B4',
      '--brand-dark': '#FF1493',
      '--brand-light': '#FFC0CB',
      '--brand-pale': '#FFF0F5',
      '--brand-text': '#5A3D46',
      '--brand-text-muted': '#9E7D86',
      '--brand-text-light': '#CBB2B9',
      '--brand-bg': '#FCF9F5',
      '--brand-accent': '#FFD700',
      '--brand-accent-dark': '#E6B800',
      '--brand-danger': '#FF4D4D',
      '--brand-focus': '#7A4DFF',

      /* Textos (nombres que usa el CSS) */
      '--text-color': '#5A3D46',
      '--text-muted': '#9E7D86',
      '--text-light': '#CBB2B9',
      '--white': '#FFFFFF',
      '--surface-bg': '#FFFFFF',
      '--color-danger': '#FF4D4D',
      '--color-danger-dark': '#E63B3B',
      '--color-focus': '#7A4DFF',

      /* Efectos & Bordes */
      '--glass-bg': 'rgba(255, 255, 255, 0.75)',
      '--glass-border': 'rgba(255, 105, 180, 0.25)',
      '--shadow-md': '0 8px 24px rgba(90, 61, 70, 0.12)',
      '--shadow-inset': 'inset 0 2px 4px rgba(90, 61, 70, 0.1)',
      '--shadow-focus': '0 0 0 3px rgba(90, 61, 70, 0.2)',
      '--border-neutral': 'rgba(90, 61, 70, 0.18)',
      '--cream-bg': '#FFF0F5',

      /* Estados de turnos (calendario y listado del día) */
      '--estado-provisional-bg': '#f9fafb',
      '--estado-provisional-color': '#6b7280',
      '--estado-provisional-border': '#d1d5db',
      '--estado-reservado-bg': '#f0f9ff',
      '--estado-reservado-color': '#0284c7',
      '--estado-reservado-border': '#7dd3fc',
      '--estado-completado-bg': '#e8f5e9',
      '--estado-completado-color': '#1b5e20',
      '--estado-completado-border': '#2e7d32',
      '--estado-cancelado-bg': '#fafafa',
      '--estado-cancelado-color': '#9ca3af',
      '--estado-cancelado-border': '#e5e7eb',
      '--estado-pill-provisional-bg': '#f3f4f6',
      '--estado-pill-provisional-color': '#4b5563',
      '--estado-pill-provisional-border': '#f59e0b',
      '--estado-pill-reservado-bg': '#e0f2fe',
      '--estado-pill-reservado-color': '#0369a1',
      '--estado-pill-reservado-border': '#0284c7',
      '--estado-pill-completado-bg': '#e8f5e9',
      '--estado-pill-completado-color': '#1b5e20',
      '--estado-pill-completado-border': '#2e7d32',
      '--estado-pill-cancelado-bg': '#f3f4f6',
      '--estado-pill-cancelado-color': '#9ca3af',
      '--estado-pill-cancelado-border': '#d1d5db',
    },
    oscuro: {
      /* Paleta de marca (mismos tonos barbie, fondos oscuros) */
      '--brand-primary': '#FF69B4',
      '--brand-dark': '#FF1493',
      '--brand-light': '#FFB7D1',
      '--brand-pale': '#1a141a',
      '--brand-text': '#e8e0e6',
      '--brand-text-muted': '#b8a8b0',
      '--brand-text-light': '#a090a0',
      '--brand-bg': '#121016',
      '--cream-bg': '#121016',
      '--white': '#FFFFFF',
      '--gold': '#FFD700',
      '--gold-dark': '#E6B800',

      /* Textos (nombres que usa el CSS) */
      '--text-color': '#e8e0e6',
      '--text-muted': '#b8a8b0',
      '--text-light': '#a090a0',
      '--white': '#FFFFFF',
      '--surface-bg': '#1a141a',
      '--color-danger': '#FF4D4D',
      '--color-danger-dark': '#E63B3B',
      '--color-focus': '#7A4DFF',

      /* Efectos & Bordes (sombras con formato completo: offsets + color) */
      '--glass-bg': 'rgba(20, 14, 20, 0.55)',
      '--glass-border': 'rgba(255, 105, 180, 0.18)',
      '--shadow-md': '0 8px 24px rgba(0, 0, 0, 0.35)',
      '--shadow-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.25)',
      '--shadow-focus': '0 0 0 3px rgba(255, 255, 255, 0.2)',
      '--border-neutral': 'rgba(255, 255, 255, 0.08)',

      /* Estados de turnos (calendario y listado del día) — tonos oscuros/sutiles */
      '--estado-provisional-bg': '#1f2937',
      '--estado-provisional-color': '#9ca3af',
      '--estado-provisional-border': '#4b5563',
      '--estado-reservado-bg': '#0f172a',
      '--estado-reservado-color': '#60a5fa',
      '--estado-reservado-border': '#1d4ed8',
      '--estado-completado-bg': '#064e3b',
      '--estado-completado-color': '#86efac',
      '--estado-completado-border': '#047857',
      '--estado-cancelado-bg': '#1f2937',
      '--estado-cancelado-color': '#6b7280',
      '--estado-cancelado-border': '#374151',
      '--estado-pill-provisional-bg': '#374151',
      '--estado-pill-provisional-color': '#d1d5db',
      '--estado-pill-provisional-border': '#f59e0b',
      '--estado-pill-reservado-bg': '#1e3a8a',
      '--estado-pill-reservado-color': '#bfdbfe',
      '--estado-pill-reservado-border': '#0284c7',
      '--estado-pill-completado-bg': '#065f46',
      '--estado-pill-completado-color': '#d1fae5',
      '--estado-pill-completado-border': '#047857',
      '--estado-pill-cancelado-bg': '#374151',
      '--estado-pill-cancelado-color': '#9ca3af',
      '--estado-pill-cancelado-border': '#d1d5db',
    },
  },
  // Ejemplo de tema adicional (descomentar y usar en BUSINESS.tema):
  // minimal: {
  //   '--brand-primary': '#2563eb',
  //   '--brand-dark': '#1d4ed8',
  //   '--brand-light': '#dbeafe',
  //   '--brand-pale': '#eff6ff',
  //   '--brand-text': '#0f172a',
  //   '--brand-text-muted': '#64748b',
  //   '--brand-text-light': '#cbd5e1',
  //   '--brand-bg': '#f8fafc',
  //   '--brand-accent': '#f59e0b',
  //   '--brand-accent-dark': '#d97706',
  //   '--brand-danger': '#ef4444',
  //   '--brand-focus': '#7c3aed',
  // },
};

export function obtenerTema(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  const tema = TEMAS[nombreTema] || TEMAS.barbie;
  return tema[modo] || tema.claro || tema;
}
