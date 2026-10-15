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
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          App de contabilidad y registro de servicios para tu negocio.
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
          Desarrollado con <i className="fa-solid fa-heart" style={{ color: 'var(--barbie-pink)', marginRight: 4 }} /> por
          <strong>Evolet Studio</strong>.
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          Service Worker: <code style={{ background: 'var(--barbie-pale)', padding: '2px 6px', borderRadius: 4 }}>{APP_VERSION}</code>
        </p>
      </div>
    </Modal>
  );
}

export default AboutModal;
