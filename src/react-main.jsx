import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style.css';
import App from './App.jsx';
import AppUpdateOverlay from './components/AppUpdateOverlay.jsx';
import { initAppVersionWatcher } from './appUpdate.js';
// Inyecta las variables de color del tema activo en :root antes de montar React,
// así no hay flash de colores y se puede cambiar de negocio/tema solo
// editando src/businessConfig.js.
import { inicializarTema } from './theme.js';
inicializarTema();

const rootElement = document.getElementById('react-root');

function Root() {
    // { active: true, version } durante ~1.2s cuando el SW avisa que hay
    // versión nueva: el overlay evita que el reload sea un salto abrupto.
    const [updating, setUpdating] = useState({ active: false, version: null });

    useEffect(() => {
        if (!import.meta.env.PROD) return undefined;
        return initAppVersionWatcher((version) => setUpdating({ active: true, version: version || null }));
    }, []);

    return (
        <StrictMode>
            <App />
            <AppUpdateOverlay visible={updating.active} version={updating.version} />
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
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
            // Chequeo inmediato al cargar (además del de visibility/focus del
            // watcher): si hay un /sw.js nuevo en el deploy, se instala sin
            // esperar a cerrar la app.
            try {
                reg?.update?.().catch(() => {});
            } catch (error) { /* ignore */ }
        }).catch((error) => {
            console.error('No se pudo registrar el service worker:', error);
        });
    }, { once: true });
}
