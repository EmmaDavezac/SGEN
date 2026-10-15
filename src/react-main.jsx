import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style.css';
import App from './App.jsx';
import AppUpdateOverlay from './components/AppUpdateOverlay.jsx';
import { initAppVersionWatcher } from './appUpdate.js';

const rootElement = document.getElementById('react-root');

function Root() {
    // true durante ~1.2s cuando el SW avisa que hay versión nueva: el overlay
    // de actualización evita que el reload sea un salto abrupto.
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (!import.meta.env.PROD) return undefined;
        return initAppVersionWatcher(() => setUpdating(true));
    }, []);

    return (
        <StrictMode>
            <App />
            <AppUpdateOverlay visible={updating} />
        </StrictMode>
    );
}

if (rootElement) {
    createRoot(rootElement).render(<Root />);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // updateViaCache: 'none' → el navegador chequea /sw.js contra la red
        // en cada visita (sin el caché HTTP de hasta 24 h), para que un
        // rebuild llegue a la UI apenas se publique.
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((error) => {
            console.error('No se pudo registrar el service worker:', error);
        });
    }, { once: true });
}
