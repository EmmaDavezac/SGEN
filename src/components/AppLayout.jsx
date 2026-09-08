import React, { useState } from 'react';
import AppFooter from './AppFooter.jsx';

function AppLayout({ children, session, onLogout, activeTab, setActiveTab, settings = {} }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = session && session.rol === 'admin';
  const { allowRegisterTab = false, allowCajasTab = false } = settings;

  return (
    <section id="app-screen" className="app-screen active">
      {/* HEADER SUPERIOR */}
      <header className="app-header">
        <div className="header-user">
          <div className="mini-logo">
            <img className="mini-logo-image" src="/icons/favicon.svg?v=2" alt="Logo" />
          </div>
          <div>
            <span className="welcome-text">Hola,</span>
            <h2 id="user-display-name" className="user-name">{session?.nombre || 'Manicurista'}</h2>
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
              {isAdmin && (
                <button 
                  id="menu-ajustes" 
                  className="account-menu-item" 
                  type="button"
                  onClick={() => {
                    setActiveTab('ajustes');
                    setMenuOpen(false);
                  }}
                >
                  <i className="fa-solid fa-gears"></i> Ajustes
                </button>
              )}
              {isAdmin && (
                <button
                  id="menu-usuarios"
                  className="account-menu-item"
                  type="button"
                  onClick={() => {
                    setActiveTab('usuarios');
                    setMenuOpen(false);
                  }}
                >
                  <i className="fa-solid fa-user-group"></i> Usuarios
                </button>
              )}
            </div>
          </div>
          <button id="btn-logout" className="btn-logout" title="Cerrar Sesión" onClick={onLogout}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL SCROLLABLE */}
      <main className={`app-content app-content-${activeTab}`}>
        {children}
        <AppFooter />
      </main>

      {/* MENU DE NAVEGACION FLOTANTE INFERIOR */}
      <nav className="app-nav">
        <button 
          className={`nav-item ${activeTab === 'registrar' ? 'active' : ''} ${!allowRegisterTab ? 'hidden' : ''}`}
          onClick={() => setActiveTab('registrar')}
        >
          <span className="nav-icon"><i className="fa-solid fa-circle-plus"></i></span>
          <span className="nav-text">Registrar</span>
        </button>

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
      </nav>
    </section>
  );
}

export default AppLayout;
