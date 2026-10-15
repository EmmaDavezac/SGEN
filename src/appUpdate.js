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

function reloadWithOverlay(showOverlay) {
    try {
        showOverlay(true);
    } catch (error) { /* ignore */ }
    window.setTimeout(() => {
        window.location.reload();
    }, UPDATE_OVERLAY_MS);
}

export function initAppVersionWatcher(showOverlay) {
    if (!('serviceWorker' in navigator)) return () => {};

    let handled = false;
    const handleNewVersion = (version) => {
        if (handled) return;
        handled = true;
        if (version) storeVersion(version);
        reloadWithOverlay(showOverlay);
    };

    const handleMessage = (event) => {
        if (event?.data?.type === 'APP_VERSION') {
            handleNewVersion(event.data.version);
        }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Respaldo: si el controller cambió (el SW nuevo tomó el control) y no
    // llegó el mensaje de versión, igual mostramos el overlay y recargamos.
    let reloaded = false;
    const handleControllerChange = () => {
        if (reloaded) return;
        reloaded = true;
        handleNewVersion(null);
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Al arrancar: pedir la versión activa y compararla con la guardada.
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
        const stored = readStoredVersion();
        const checkVersion = (event) => {
            if (event?.data?.type !== 'APP_VERSION') return;
            navigator.serviceWorker.removeEventListener('message', checkVersion);
            if (stored && event.data.version && stored !== String(event.data.version)) {
                handleNewVersion(event.data.version);
            } else if (event.data.version) {
                storeVersion(event.data.version);
            }
        };
        navigator.serviceWorker.addEventListener('message', checkVersion);
    }

    return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
}

export const APP_UPDATE_OVERLAY_MS = UPDATE_OVERLAY_MS;
