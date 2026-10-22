import React from 'react';

function Loader({ show = true, text = 'Cargando...' }) {
  if (!show) return null;

  return (
    <div className="loader-overlay" aria-live="polite" aria-busy="true">
      <div className="spinner-container">
        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        <p>{text}</p>
      </div>
    </div>
  );
}

export default Loader;
