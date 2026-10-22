import { useEffect, useState } from 'react';

const NETWORK_ERROR_TERMS = [
    'network',
    'offline',
    'fetch',
    'failed to fetch',
    'connect',
    'internet',
    'connection',
    'timeout',
    'abort',
    'err_internet_disconnected',
    'err_network_changed',
    'load failed'
];

/**
 * Determina si un error capturado corresponde a un fallo de red o conectividad.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isNetworkError(error) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return true;
    }
    if (!error) return false;

    if (error instanceof TypeError && error.message) {
        const msg = error.message.toLowerCase();
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('load failed')) {
            return true;
        }
    }

    if (error.status === 0 || error.code === 'ABORT_ERR') {
        return true;
    }

    const message = (error.message || error.error_description || String(error)).toLowerCase();
    return NETWORK_ERROR_TERMS.some((term) => message.includes(term));
}

/**
 * Hook para monitorear el estado de la conexión a internet.
 * Permite mostrar avisos cuando se pierde la red y cuando se restablece.
 */
export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
    const [wasOffline, setWasOffline] = useState(false);
    const [justReconnected, setJustReconnected] = useState(false);

    useEffect(() => {
        let timerId = null;

        const handleOnline = () => {
            setIsOnline(true);
            if (wasOffline) {
                setJustReconnected(true);
                if (timerId) clearTimeout(timerId);
                timerId = setTimeout(() => {
                    setJustReconnected(false);
                    setWasOffline(false);
                }, 3500);
            }
        };

        const handleOffline = () => {
            setIsOnline(false);
            setWasOffline(true);
            setJustReconnected(false);
            if (timerId) clearTimeout(timerId);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (timerId) clearTimeout(timerId);
        };
    }, [wasOffline]);

    return { isOnline, justReconnected };
}
