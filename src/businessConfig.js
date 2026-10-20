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
      /* PRUEBA LOCAL (no commitear): blancos rotos cálidos — el modo claro
         original era demasiado blanco (fondos y tarjetas #FFFFFF/#FCF9F5). */
      /* Paleta de marca */
      '--brand-primary': '#FF69B4',
      '--brand-dark': '#FF1493',
      '--brand-light': '#FFC0CB',
      '--brand-pale': '#F5E3EB',
      '--brand-text': '#5A3D46',
      '--brand-text-muted': '#9E7D86',
      '--brand-text-light': '#CBB2B9',
      '--brand-bg': '#F1E8E2',
      '--brand-accent': '#FFD700',
      '--brand-accent-dark': '#E6B800',
      '--brand-danger': '#FF4D4D',
      '--brand-focus': '#7A4DFF',

      /* Textos (nombres que usa el CSS) */
      '--text-color': '#5A3D46',
      '--text-muted': '#9E7D86',
      '--text-light': '#CBB2B9',
      '--white': '#FAF4EF',
      '--surface-bg': '#FAF4EF',
      '--color-danger': '#FF4D4D',
      '--color-danger-dark': '#E63B3B',
      '--color-focus': '#7A4DFF',

      /* Efectos & Bordes */
      '--glass-bg': 'rgba(250, 244, 239, 0.85)',
      '--glass-border': 'rgba(255, 105, 180, 0.25)',
      '--shadow-md': '0 8px 24px rgba(90, 61, 70, 0.12)',
      '--shadow-inset': 'inset 0 2px 4px rgba(90, 61, 70, 0.1)',
      '--shadow-focus': '0 0 0 3px rgba(90, 61, 70, 0.2)',
      '--border-neutral': 'rgba(90, 61, 70, 0.22)',
      '--cream-bg': '#F3E4EA',

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
      /* PRUEBA LOCAL (no commitear): paleta suavizada — grises cálidos,
         rosas mate y blancos rotos. El estilo fuerte original vive en
         SUPEROSCURO_BARBIE más abajo. */
      '--brand-primary': '#D68CAE',
      '--brand-dark': '#B96B90',
      '--brand-light': '#8A7280',
      '--brand-pale': '#2E2A33',
      '--brand-text': '#D9D0D8',
      '--brand-text-muted': '#B3A6B0',
      '--brand-text-light': '#9A8E98',
      '--brand-bg': '#232029',
      '--cream-bg': '#232029',
      '--white': '#F2EAF0',
      '--gold': '#C9A94A',
      '--gold-dark': '#A88C3A',

      /* Textos (nombres que usa el CSS) */
      '--text-color': '#D9D0D8',
      '--text-muted': '#B3A6B0',
      '--text-light': '#9A8E98',
      '--white': '#F2EAF0',
      '--surface-bg': '#2E2A33',
      '--color-danger': '#D97A7A',
      '--color-danger-dark': '#B95F5F',
      '--color-focus': '#9A8BD0',

      /* Efectos & Bordes (sombras con formato completo: offsets + color) */
      '--glass-bg': 'rgba(46, 42, 51, 0.55)',
      '--glass-border': 'rgba(214, 140, 174, 0.18)',
      '--shadow-md': '0 8px 24px rgba(0, 0, 0, 0.35)',
      '--shadow-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.25)',
      '--shadow-focus': '0 0 0 3px rgba(214, 140, 174, 0.25)',
      '--border-neutral': 'rgba(255, 255, 255, 0.14)',

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

// ---------------------------------------------------------------------------
// Temas locales de prueba (no commitear el armado final):
// - La prueba suavizada vive en barbie.oscuro (se deja como está).
// - 'superoscuro' recupera la paleta fuerte original (negros puros #121016,
//   rosas intensos #FF69B4). Bloque copiado del HEAD.
// ---------------------------------------------------------------------------
const SUPEROSCURO_BARBIE = {
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
  '--surface-bg': '#1a141a',
  '--color-danger': '#FF4D4D',
  '--color-danger-dark': '#E63B3B',
  '--color-focus': '#7A4DFF',
  /* Efectos & Bordes */
  '--glass-bg': 'rgba(20, 14, 20, 0.55)',
  '--glass-border': 'rgba(255, 105, 180, 0.18)',
  '--shadow-md': '0 8px 24px rgba(0, 0, 0, 0.35)',
  '--shadow-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.25)',
  '--shadow-focus': '0 0 0 3px rgba(255, 255, 255, 0.2)',
  '--border-neutral': 'rgba(255, 255, 255, 0.08)',
  /* Estados de turnos — tonos oscuros/sutiles */
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
};

// Cambia solo los acentos de marca sobre una paleta base ya armada.
function retintar(base, acentos) {
  return { ...base, ...acentos };
}

// Acentos por color x modo. 'rosa' no figura porque barbie ya es rosa.
const ACENTOS_EXTRA = {
  azul: {
    claro: {
      '--brand-primary': '#2563EB',
      '--brand-dark': '#1D4ED8',
      '--brand-light': '#BFDBFE',
      '--brand-accent': '#F59E0B',
      '--brand-accent-dark': '#D97706',
      '--brand-focus': '#2563EB',
      '--glass-border': 'rgba(37, 99, 235, 0.25)',
      '--shadow-focus': '0 0 0 3px rgba(37, 99, 235, 0.25)',
      '--gold': '#F59E0B',
      '--gold-dark': '#D97706',
      '--color-danger': '#EF4444',
      '--color-danger-dark': '#DC2626',
      '--color-focus': '#2563EB',
    },
    oscuro: {
      '--brand-primary': '#5B8DEF',
      '--brand-dark': '#3B6FD4',
      '--brand-light': '#5B6B8C',
      '--brand-focus': '#5B8DEF',
      '--glass-border': 'rgba(91, 141, 239, 0.22)',
      '--shadow-focus': '0 0 0 3px rgba(91, 141, 239, 0.25)',
      '--gold': '#E8B34B',
      '--gold-dark': '#C99634',
      '--color-danger': '#E08A8A',
      '--color-danger-dark': '#C26E6E',
      '--color-focus': '#8AA9F0',
    },
    superoscuro: {
      '--brand-primary': '#3B82F6',
      '--brand-dark': '#1D4ED8',
      '--brand-light': '#93C5FD',
      '--brand-focus': '#3B82F6',
      '--glass-border': 'rgba(59, 130, 246, 0.20)',
      '--shadow-focus': '0 0 0 3px rgba(147, 197, 253, 0.25)',
      '--gold': '#FBBF24',
      '--gold-dark': '#D97706',
      '--color-danger': '#F87171',
      '--color-danger-dark': '#DC2626',
      '--color-focus': '#60A5FA',
    },
  },
  blanco: {
    claro: {
      '--brand-primary': '#8A8A93',
      '--brand-dark': '#55555E',
      '--brand-light': '#D9D9DE',
      '--brand-accent': '#C0A062',
      '--brand-accent-dark': '#A3874F',
      '--brand-focus': '#55555E',
      '--glass-border': 'rgba(85, 85, 94, 0.25)',
      '--shadow-focus': '0 0 0 3px rgba(85, 85, 94, 0.25)',
      '--gold': '#C0A062',
      '--gold-dark': '#A3874F',
      '--color-danger': '#DC2626',
      '--color-danger-dark': '#B91C1C',
      '--color-focus': '#55555E',
    },
    oscuro: {
      '--brand-primary': '#CFCFD6',
      '--brand-dark': '#A9A9B3',
      '--brand-light': '#55555E',
      '--brand-focus': '#CFCFD6',
      '--glass-border': 'rgba(207, 207, 214, 0.22)',
      '--shadow-focus': '0 0 0 3px rgba(207, 207, 214, 0.25)',
      '--gold': '#C9A94A',
      '--gold-dark': '#A88C3A',
      '--color-danger': '#D97A7A',
      '--color-danger-dark': '#B95F5F',
      '--color-focus': '#CFCFD6',
    },
    superoscuro: {
      '--brand-primary': '#E4E4E7',
      '--brand-dark': '#A1A1AA',
      '--brand-light': '#71717A',
      '--brand-focus': '#E4E4E7',
      '--glass-border': 'rgba(228, 228, 231, 0.18)',
      '--shadow-focus': '0 0 0 3px rgba(228, 228, 231, 0.25)',
      '--gold': '#FFD700',
      '--gold-dark': '#E6B800',
      '--color-danger': '#FF4D4D',
      '--color-danger-dark': '#E63B3B',
      '--color-focus': '#E4E4E7',
    },
  },
  rojo: {
    claro: {
      '--brand-primary': '#DC2626',
      '--brand-dark': '#B91C1C',
      '--brand-light': '#FECACA',
      '--brand-accent': '#F59E0B',
      '--brand-accent-dark': '#D97706',
      '--brand-focus': '#7C2D12',
      '--glass-border': 'rgba(220, 38, 38, 0.25)',
      '--shadow-focus': '0 0 0 3px rgba(220, 38, 38, 0.25)',
      '--gold': '#F59E0B',
      '--gold-dark': '#D97706',
      '--color-danger': '#B91C1C',
      '--color-danger-dark': '#991B1B',
      '--color-focus': '#7C2D12',
    },
    oscuro: {
      '--brand-primary': '#D96A6A',
      '--brand-dark': '#B94F4F',
      '--brand-light': '#7A5560',
      '--brand-focus': '#D96A6A',
      '--glass-border': 'rgba(217, 106, 106, 0.22)',
      '--shadow-focus': '0 0 0 3px rgba(217, 106, 106, 0.25)',
      '--gold': '#E8B34B',
      '--gold-dark': '#C99634',
      '--color-danger': '#D96A6A',
      '--color-danger-dark': '#B94F4F',
      '--color-focus': '#E09A9A',
    },
    superoscuro: {
      '--brand-primary': '#EF4444',
      '--brand-dark': '#B91C1C',
      '--brand-light': '#FCA5A5',
      '--brand-focus': '#EF4444',
      '--glass-border': 'rgba(239, 68, 68, 0.20)',
      '--shadow-focus': '0 0 0 3px rgba(252, 165, 165, 0.25)',
      '--gold': '#FBBF24',
      '--gold-dark': '#D97706',
      '--color-danger': '#FF4D4D',
      '--color-danger-dark': '#E63B3B',
      '--color-focus': '#FCA5A5',
    },
  },
};

// Súper oscuro del rosa = la paleta fuerte original.
TEMAS.barbie.superoscuro = SUPEROSCURO_BARBIE;

// Colores extra solo-superadmin: mismo fondo/textos/estados del modo,
// solo cambian los acentos de marca.
for (const color of Object.keys(ACENTOS_EXTRA)) {
  TEMAS[color] = {
    claro: retintar(TEMAS.barbie.claro, ACENTOS_EXTRA[color].claro),
    oscuro: retintar(TEMAS.barbie.oscuro, ACENTOS_EXTRA[color].oscuro),
    superoscuro: retintar(SUPEROSCURO_BARBIE, ACENTOS_EXTRA[color].superoscuro),
  };
}

// Nombres visibles de los colores de tema (selector solo-superadmin).
export const NOMBRES_TEMAS = {
  barbie: 'Rosa',
  azul: 'Azul',
  blanco: 'Blanco',
  rojo: 'Rojo',
};

export function obtenerTema(nombreTema = BUSINESS.tema, modo = BUSINESS.modo) {
  const clave = TEMAS[nombreTema] ? nombreTema : 'barbie';
  const modosValidos = ['claro', 'oscuro', 'superoscuro'];
  const modoFinal = modosValidos.includes(modo) ? modo : 'claro';
  const tema = TEMAS[clave] || TEMAS.barbie;
  return tema[modoFinal] || tema.oscuro || tema.claro || tema;
}
