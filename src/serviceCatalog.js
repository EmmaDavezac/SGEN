export const DEFAULT_SERVICE_CATEGORIES = [
    { key: 'semi', name: 'Semi', active: true },
    { key: 'kapping', name: 'Kapping', active: true },
    { key: 'softgel', name: 'Soft Gel', active: true },
    { key: 'esculpidas', name: 'Esculpidas', active: true },
    { key: 'remocion', name: 'Remoción', active: true },
    { key: 'personalizado', name: 'Otro', active: true }
];

export const DEFAULT_SERVICE_CATALOG = {
    semi: [
        { name: 'Semipermanente Basic', price: 12000, active: true },
        { name: 'Semipermanente Full', price: 14000, active: true }
    ],
    kapping: [
        { name: 'Kapping', price: 12500, active: true },
        { name: 'Kapping Basic', price: 14000, active: true },
        { name: 'Kapping Full', price: 15500, active: true },
        { name: 'Kapping con Polygel Basic', price: 15500, active: true },
        { name: 'Kapping con Polygel Full', price: 17000, active: true }
    ],
    softgel: [
        { name: 'Soft Gel Basic', price: 16500, active: true },
        { name: 'Soft Gel Full', price: 18000, active: true }
    ],
    esculpidas: [
        { name: 'Esculpidas en Polygel Basic', price: 17500, active: true },
        { name: 'Esculpidas en Polygel Full', price: 19000, active: true }
    ],
    remocion: [
        { name: 'Retiro Servicio Propio', price: 0, active: true },
        { name: 'Remoción Semipermanente', price: 4500, active: true },
        { name: 'Remoción Kapping', price: 5000, active: true },
        { name: 'Remoción Softgel', price: 5500, active: true },
        { name: 'Remoción Polygel', price: 6000, active: true },
        { name: 'Remoción Acrilico', price: 6500, active: true }
    ],
    personalizado: [
        { name: 'Servicio Personalizado', price: 0, active: true }
    ]
};

export function cloneServiceCatalog(catalog) {
    return Object.fromEntries(
        Object.entries(catalog).map(([key, services]) => [
            key,
            services.map(service => ({ ...service }))
        ])
    );
}

export function createCategoryKey(name, existingKeys = []) {
    const base = String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'categoria';
    let key = base;
    let suffix = 2;
    while (existingKeys.includes(key)) {
        key = `${base}-${suffix}`;
        suffix += 1;
    }
    return key;
}

/* Orden de presentation de las categorías en "Registrar Servicio":
   semis → kapping → softgel → esculpidas → retiro → otro → pestañas.
   Cada posición agrupa aliases equivalentes (clave o nombre visible) para
   tolerar categorías renombradas o creadas desde Precios. */
const CATEGORY_ORDER_ALIASES = [
    ['semi', 'semis'],
    ['kapping'],
    ['softgel', 'soft gel'],
    ['esculpidas', 'esculpidas en polygel'],
    ['remocion', 'retiro', 'remocion de esmalte'],
    ['personalizado', 'otro', 'personalizado / combinado'],
    ['pestanas', 'pestañas']
];

function normalizeCategoryText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function sortCategoriesForDisplay(categories = []) {
    const rankOf = (category) => {
        const key = normalizeCategoryText(category.key);
        const name = normalizeCategoryText(category.name);
        const index = CATEGORY_ORDER_ALIASES.findIndex(
            (aliases) => aliases.includes(key) || aliases.includes(name)
        );
        return index === -1 ? CATEGORY_ORDER_ALIASES.length : index;
    };
    return [...categories].sort((a, b) => {
        const diff = rankOf(a) - rankOf(b);
        if (diff !== 0) return diff;
        return normalizeCategoryText(a.name).localeCompare(normalizeCategoryText(b.name));
    });
}