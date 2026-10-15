import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Overlay de actualización de versión de la PWA.
 *
 * Cuando el service worker detecta una versión nueva (CACHE_VERSION distinta),
 * se muestra este overlay con el corazón de la marca latiendo y el texto
 * "Actualizando a la nueva versión…" durante ~1.2s antes de recargar, para que
 * el cambio de versión no sea un salto abrupto (pantalla blanca / parpadeo).
 *
 * Reutiliza `.loader-overlay` (z-index 150000, por encima de modales) y
 * `.heart-spinner` (latido de la marca). Sin emojis (GUIA_VISUAL).
 */
function AppUpdateOverlay({ visible }) {
    if (!visible) return null;
    return createPortal(
        <div className="loader-overlay app-update-overlay" aria-live="polite" aria-busy="true">
            <div className="spinner-container">
                <i className="fa-solid fa-heart heart-spinner" aria-hidden="true"></i>
                <p>Actualizando a la nueva versión…</p>
            </div>
        </div>,
        document.body
    );
}

export default AppUpdateOverlay;
