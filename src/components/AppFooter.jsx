import React from 'react';

function AppFooter({ compact = false }) {
    return (
        <footer className={`app-footer${compact ? ' app-footer-compact' : ''}`}>
            <span>Evolet Studio</span>
            <span aria-hidden="true">·</span>
            <span>Hecho con <i className="fa-solid fa-heart" aria-hidden="true" /> para tu negocio</span>
        </footer>
    );
}

export default AppFooter;
