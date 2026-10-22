import React, { useRef, useState } from 'react';
import AppFooter from './AppFooter.jsx';
import AboutModal from './AboutModal.jsx';
import NetworkStatusBanner from './NetworkStatusBanner.jsx';
import { useNetworkStatus } from '../offline/network.js';
import { usePullToRefreshGesture } from '../pullToRefresh.js';
import { BUSINESS } from '../businessConfig.js';

function AppLayout({ children, session, onLogout, activeTab, setActiveTab, settings = {} }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { isOnline, justReconnected } = useNetworkStatus();
  const isAdmin = session && (session.rol === 'admin' || session.rol === 'superadmin');
  const isSuperadmin = session && session.rol === 'superadmin';
  const { allowCajasTab = false } = settings;
  // Pull-to-refresh: el gesto se detecta sobre el scroller `.app-content`
  // (único contenedor con scroll, ya que el body tiene overflow: hidden).
  const contentRef = useRef(null);
  const { distance, refreshing } = usePullToRefreshGesture(contentRef);
  // El indicador baja con el dedo; al recargar queda fijo girando.
  const indicatorVisible = distance > 0 || refreshing;

  return (
    <section id="app-screen" className="app-screen active">
      {/* HEADER SUPERIOR */}
      <header className="app-header">
        <div className="header-user">
          <div className="mini-logo">
            <img className="mini-logo-image" src="/icons/favicon.svg?v=2" alt="Logo" />
          </div>
          <div className="header-business-block">
            <h2 id="user-display-name" className="user-name">{BUSINESS.nombre}</h2>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="account-menu-wrapper">
            <button 
              id="btn-header-menu" 
              className="header-action-btn avatar-menu-btn" 
              title="Abrir menú de cuenta" 
              aria-label="Abrir menú de cuenta"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="header-avatar"><i className="fa-solid fa-user"></i></span>
              <i className="fa-solid fa-chevron-down"></i>
            </button>
            <div id="account-menu" className={`account-menu ${menuOpen ? '' : 'hidden'}`}>
              <div className="account-menu-profile">
                <div className="account-menu-avatar">
                  <i className="fa-solid fa-user"></i>
                </div>
                <div className="account-menu-profile-text">
                  <strong>{session?.nombre || 'Manicurista'}</strong>
                  <span>
                    {session?.rol === 'superadmin' ? 'Superadmin' : session?.rol === 'admin' ? 'Administrador' : 'Manicurista'}
                  </span>
                </div>
              </div>
              <button 
                id="menu-cuenta" 
                className="account-menu-item" 
                type="button"
                onClick={() => {
                  setActiveTab('cuenta');
                  setMenuOpen(false);
                }}
              >
                <i className="fa-solid fa-user-gear"></i> Mi cuenta
              </button>
              <button
                id="menu-about"
                className="account-menu-item"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setAboutOpen(true);
                }}
              >
                <i className="fa-solid fa-circle-info"></i> Acerca de
              </button>
              <button
                id="menu-logout"
                className="account-menu-item account-menu-item--danger"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* BANNER DE ESTADO DE CONECTIVIDAD (OFFLINE / RECONEXION) */}
      <NetworkStatusBanner isOnline={isOnline} justReconnected={justReconnected} />

      {/* CONTENIDO PRINCIPAL SCROLLABLE */}
      <main ref={contentRef} className={`app-content app-content-${activeTab}`}>
        {children}
        <AppFooter />
      </main>

      {/* INDICADOR PULL-TO-REFRESH: baja con el arrastre y gira al recargar. */}
      <div
        className={`pull-refresh-indicator${refreshing ? ' is-refreshing' : ''}`}
        style={{ opacity: indicatorVisible ? 1 : 0, transform: `translate(-50%, ${refreshing ? 24 : distance}px)` }}
        aria-hidden={!indicatorVisible}
      >
        {refreshing
          ? <span className="spinner" role="status" aria-label="Recargando"></span>
          : <i className="fa-solid fa-arrow-down pull-refresh-arrow"></i>}
      </div>

      {/* MENU DE NAVEGACION FLOTANTE INFERIOR */}
      <nav className="app-nav" aria-label="Navegación principal">
        <button 
          className={`nav-item ${(activeTab === 'calendario' || activeTab === 'historial') ? 'active' : ''}`}
          onClick={() => setActiveTab('calendario')}
        >
          <span className="nav-icon"><i className="fa-solid fa-calendar-days"></i></span>
          <span className="nav-text">Agenda</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'clientes' ? 'active' : ''}`}
          onClick={() => setActiveTab('clientes')}
        >
          <span className="nav-icon"><i className="fa-solid fa-users"></i></span>
          <span className="nav-text">Clientes</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'gastos' ? 'active' : ''}`}
          onClick={() => setActiveTab('gastos')}
        >
          <span className="nav-icon"><i className="fa-solid fa-wallet"></i></span>
          <span className="nav-text">Gastos</span>
        </button>

        <button 
          className={`nav-item ${activeTab === 'estadisticas' ? 'active' : ''}`}
          onClick={() => setActiveTab('estadisticas')}
        >
          <span className="nav-icon"><i className="fa-solid fa-chart-line"></i></span>
          <span className="nav-text">Estadísticas</span>
        </button>

        {isAdmin && (
          <button 
            id="nav-btn-config"
            className={`nav-item ${activeTab === 'precios' ? 'active' : ''}`}
            onClick={() => setActiveTab('precios')}
          >
            <span className="nav-icon"><i className="fa-solid fa-tags"></i></span>
            <span className="nav-text">Precios</span>
          </button>
        )}

        {isAdmin && allowCajasTab && (
          <button 
            id="nav-btn-cajas"
            className={`nav-item ${activeTab === 'cajas' ? 'active' : ''}`}
            onClick={() => setActiveTab('cajas')}
          >
            <span className="nav-icon"><i className="fa-solid fa-vault"></i></span>
            <span className="nav-text">Cajas</span>
          </button>
        )}

        {isSuperadmin && (
          <button
            id="nav-btn-users"
            className={`nav-item ${activeTab === 'usuarios' ? 'active' : ''}`}
            onClick={() => setActiveTab('usuarios')}
          >
            <span className="nav-icon"><i className="fa-solid fa-user-group"></i></span>
            <span className="nav-text">Usuarios</span>
          </button>
        )}

        {isAdmin && (
          <button
            id="nav-btn-settings"
            className={`nav-item ${activeTab === 'ajustes' ? 'active' : ''}`}
            onClick={() => setActiveTab('ajustes')}
          >
            <span className="nav-icon"><i className="fa-solid fa-gears"></i></span>
            <span className="nav-text">Ajustes</span>
          </button>
        )}

      </nav>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </section>
  );
}

export default AppLayout;
