/**
 * Detección de nueva versión de la PWA.
 *
 * Estrategia (ver AGENTS.md, regla "Versionado de la PWA"):
 * - Cada commit que cambia UI/lógica sube CACHE_VERSION en public/sw.js.
 * - El SW nuevo hace skipWaiting + clients.claim y notifica con el mensaje
 *   { type: 'APP_VERSION', version: CACHE_VERSION }.
 * - Acá escuchamos ese mensaje (y el cambio de controller como respaldo):
 *   mostramos el overlay de actualización ~1.2s y recargamos, para que el
 *   salto de versión no sea abrupto.
 *
 * Se guarda la última versión vista en localStorage (evolet_app_version):
 * si al arrancar la versión del SW es distinta a la guardada, también se
 * muestra el overlay y se recarga una vez.
 */

const VERSION_KEY = 'evolet_app_version';
const UPDATE_OVERLAY_MS = 1200;

function readStoredVersion() {
    try {
        return localStorage.getItem(VERSION_KEY);
    } catch (error) {
        return null;
    }
}

function storeVersion(version) {
    try {
        if (version) localStorage.setItem(VERSION_KEY, String(version));
    } catch (error) { /* ignore */ }
}

function reloadWithOverlay(showOverlay, version) {
    // El callback puede ser setUpdating directo o una fn que recibe la versión.
    try {
        if (showOverlay.length > 0) showOverlay(version);
        else showOverlay(true);
    } catch (error) { /* ignore */ }
    window.setTimeout(() => {
        window.location.reload();
    }, UPDATE_OVERLAY_MS);
}

export function initAppVersionWatcher(showOverlay) {
    if (!('serviceWorker' in navigator)) return () => {};

    // Guardia anti-bucle: si ya recargamos por update hace <30s, no repetir.
    const RELOAD_GUARD_MS = 30000;
    const GUARD_KEY = 'evolet_update_reload_at';
    try {
        const last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
        if (last && Date.now() - last < RELOAD_GUARD_MS) return () => {};
    } catch (error) { /* ignore */ }

    let updateStarted = false;
    const startUpdate = (version) => {
        if (updateStarted) return;
        updateStarted = true;
        if (version) storeVersion(version);
        try {
            sessionStorage.setItem(GUARD_KEY, String(Date.now()));
        } catch (error) { /* ignore */ }
        reloadWithOverlay(showOverlay, version);
    };

    // Un solo manejador: solo recarga si la versión entrante difiere de la
    // guardada. La respuesta al GET_VERSION inicial ya no dispara reload en
    // cada arranque (ese era el bucle: cada load recargaba).
    const handleMessage = (event) => {
        if (event?.data?.type !== 'APP_VERSION') return;
        const incoming = event.data.version ? String(event.data.version) : null;
        if (!incoming) return;
        const stored = readStoredVersion();
        if (!stored) {
            storeVersion(incoming);
            return;
        }
        if (stored !== incoming) {
            startUpdate(incoming);
        }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Respaldo: si el controller cambió (SW nuevo tomó el control), pedir la
    // versión al controller nuevo y dejar que el comparador decida. No se
    // recarga a ciegas: así se evita el bucle.
    const handleControllerChange = () => {
        try {
            navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
        } catch (error) { /* ignore */ }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Al arrancar: pedir la versión activa para inicializar/comparar.
    try {
        navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
    } catch (error) { /* ignore */ }

    // Chequeo periódico por si la PWA queda abierta en segundo plano: fuerza
    // al navegador a bajar el /sw.js nuevo sin esperar a cerrar la app.
    const checkForUpdate = () => {
        try {
            navigator.serviceWorker.getRegistration().then((reg) => reg?.update?.().catch(() => {}));
        } catch (error) { /* ignore */ }
    };
    const pollId = window.setInterval(checkForUpdate, 15 * 60 * 1000);

    // Al volver a la app (visible o foco), chequear update de inmediato: es el
    // caso típico "deployé y abro la PWA instalada" — sin esto el navegador
    // solo chequeaba /sw.js al cerrar y reabrir.
    const handleVisible = () => {
        if (document.visibilityState === 'visible') checkForUpdate();
    };
    const handleFocus = () => checkForUpdate();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleFocus);

    return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        document.removeEventListener('visibilitychange', handleVisible);
        window.removeEventListener('focus', handleFocus);
        window.clearInterval(pollId);
    };
}

export const APP_UPDATE_OVERLAY_MS = UPDATE_OVERLAY_MS;
