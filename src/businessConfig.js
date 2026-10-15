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

export function obtenerTema(nombreTema = BUSINESS.tema) {
  return TEMAS[nombreTema] || TEMAS.barbie;
}
