import React from 'react';

function NetworkStatusBanner({ isOnline, justReconnected, pendingCount = 0 }) {
    if (isOnline && !justReconnected) {
        return null;
    }

    if (!isOnline) {
        return (
            <div className="network-status-banner offline" role="status" aria-live="polite">
                <i className="fa-solid fa-wifi" aria-hidden="true"></i>
                <span>
                    Sin conexión a internet (modo offline)
                    {pendingCount > 0 ? ` · ${pendingCount} cambio${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''}` : ''}
                </span>
            </div>
        );
    }

    if (justReconnected) {
        return (
            <div className="network-status-banner reconnected" role="status" aria-live="polite">
                <i className="fa-solid fa-check" aria-hidden="true"></i>
                <span>Conexión a internet restablecida</span>
            </div>
        );
    }

    return null;
}

export default NetworkStatusBanner;
