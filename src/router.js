export const ROUTES = {
    calendario: '/agenda',
    historial: '/historial',
    clientes: '/clientes',
    gastos: '/gastos',
    estadisticas: '/estadisticas',
    precios: '/precios',
    cajas: '/cajas',
    ajustes: '/ajustes',
    cuenta: '/cuenta',
    registrar: '/registrar'
};

const routeEntries = Object.entries(ROUTES);

export function getTabFromPath(pathname) {
    const raw = (pathname || '/').trim();
    const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
    if (path === '/' || path === '' || path === '/index.html') return 'calendario';
    return routeEntries.find(([, route]) => route === path)?.[0] || null;
}

export function getPathForTab(tab) {
    return ROUTES[tab] || ROUTES.calendario;
}

export function isKnownPath(pathname) {
    return getTabFromPath(pathname) !== null;
}
