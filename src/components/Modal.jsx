import React, { useEffect, useId, useRef } from 'react';

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
  const previousFocusRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirstControl = window.requestAnimationFrame(() => {
      const firstControl = cardRef.current?.querySelector(focusableSelector);
      (firstControl || cardRef.current)?.focus?.();
    });
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const controls = [...cardRef.current.querySelectorAll(focusableSelector)];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(focusFirstControl);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previousFocusRef.current?.focus?.();
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
      aria-labelledby={title ? titleId : undefined}
      onClick={handleBackdrop}
    >
      <div ref={cardRef} className={`modal-card ${sizeClass}`.trim()} tabIndex="-1">
        {title && <h3 id={titleId}>{title}</h3>}
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
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            <i className="fa-solid fa-check" aria-hidden="true"></i>
            {busy ? 'Procesando...' : confirmText}
          </button>
        </>
      }
    >
      <div className="confirm-message">
        {message}
      </div>
    </Modal>
  );
}

export default Modal;
