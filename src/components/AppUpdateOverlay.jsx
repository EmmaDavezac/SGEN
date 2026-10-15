import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Overlay de actualización de versión de la PWA.
 *
 * Diseño neutro y reutilizable (sin marca): spinner genérico FontAwesome
 * (fa-circle-notch) + barra de progreso por fases + texto de fase.
 *
 * Fases:
 *  - "download": "Descargando nueva versión (vX)…" (pre-reload, SW nuevo
 *    todavía no controla la página).
 *  - "apply": "Aplicando actualización…" (el SW nuevo ya tomó el control,
 *    a punto de recargar).
 *  - "loading": "Cargando nueva versión (vX)…" (post-reload: la app arranca
 *    con el bundle nuevo y el overlay solo se oculta cuando App está lista).
 *
 * Reutiliza `.loader-overlay` como contenedor (z-index 150000, por encima de
 * modales); los estilos propios viven en `.app-update-*` (style.css).
 * Sin emojis (GUIA_VISUAL).
 */
const PHASE_TEXT = {
    download: (version) => `Descargando nueva versión${version ? ` (${version})` : ''}…`,
    apply: () => 'Aplicando actualización…',
    loading: (version) => `Cargando nueva versión${version ? ` (${version})` : ''}…`,
};

function AppUpdateOverlay({ visible, version, phase = 'download' }) {
    if (!visible) return null;
    const text = (PHASE_TEXT[phase] || PHASE_TEXT.download)(version);
    return createPortal(
        <div className="loader-overlay app-update-overlay" aria-live="polite" aria-busy="true">
            <div className="app-update-card">
                <i className="fa-solid fa-circle-notch fa-spin app-update-spinner" aria-hidden="true"></i>
                <p className="app-update-text">{text}</p>
                <div className="app-update-bar" aria-hidden="true">
                    <div className={`app-update-bar-fill is-${phase}`} />
                </div>
            </div>
        </div>,
        document.body
    );
}

export default AppUpdateOverlay;
