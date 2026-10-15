import React from 'react';
import { BUSINESS } from '../businessConfig.js';

function AppFooter({ compact = false }) {
    return (
        <footer className={`app-footer${compact ? ' app-footer-compact' : ''}`}>
            <span>{BUSINESS.nombre}</span>
            <span aria-hidden="true">·</span>
            <span>Hecho con <i className="fa-solid fa-heart" aria-hidden="true" /> para tu negocio</span>
        </footer>
    );
}

export default AppFooter;
