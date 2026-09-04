import React, { useEffect, useRef } from 'react';

function Modal({
  open = false,
  title,
  subtitle,
  children,
  actions,
  onClose,
  closeOnBackdrop = true,
  sizeClass = '',
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (!closeOnBackdrop) return;
    if (cardRef.current && !cardRef.current.contains(e.target)) {
      if (onClose) onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={handleBackdrop}
    >
      <div ref={cardRef} className={`modal-card ${sizeClass}`.trim()}>
        {title && <h3 id="modal-title">{title}</h3>}
        {subtitle && <p className="modal-sub">{subtitle}</p>}

        <div className="modal-body">{children}</div>

        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title = 'Confirmar acción',
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  busy = false,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      closeOnBackdrop={!busy}
      actions={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmText}
          </button>
        </>
      }
    >
      <div style={{ lineHeight: 1.5, textAlign: 'center', color: 'var(--text-color)' }}>
        {message}
      </div>
    </Modal>
  );
}

export default Modal;
