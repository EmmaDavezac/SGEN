import React from 'react';
import { APP_VERSION } from '../version.js';
import Modal from './Modal.jsx';

function AboutModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      title="Acerca de Evolet Studio"
      subtitle={`Versión ${APP_VERSION}`}
      onClose={onClose}
      showCloseButton
      sizeClass="about-modal-card"
    >
      <div className="about-icon">
        <i className="fa-solid fa-building panel-heading-icon" aria-hidden="true" />
      </div>
      <p className="about-description">
        App de contabilidad y registro de servicios para tu negocio.
      </p>
      <div className="chart-section about-info">
        <h4>
          <i className="fa-solid fa-circle-info panel-heading-icon" aria-hidden="true" />
          Información
        </h4>
        <div className="about-row">
          <span className="about-label">Desarrollado por</span>
          <span className="about-value">Emmanuel Davezac</span>
        </div>
      </div>
    </Modal>
  );
}

export default AboutModal;
