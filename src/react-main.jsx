import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style.css';
import App from './App.jsx';

const rootElement = document.getElementById('react-root');

if (rootElement) {
    createRoot(rootElement).render(
        <StrictMode>
            <App />
        </StrictMode>
    );
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
