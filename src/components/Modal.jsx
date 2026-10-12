import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

function Modal({
  open = false,
  title,
  subtitle,
  children,
  actions,
  onClose,
  closeOnBackdrop = true,
  showCloseButton = false,
  sizeClass = '',
}) {
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirstControl = window.requestAnimationFrame(() => {
      const firstControl = cardRef.current?.querySelector(focusableSelector);
      (firstControl || cardRef.current)?.focus?.();
    });
    const onKey = (e) => {
      if (e.key === 'Escape' && onCloseRef.current) {
        onCloseRef.current();
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
  }, [open]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (!closeOnBackdrop) return;
    if (cardRef.current && !cardRef.current.contains(e.target)) {
      if (onClose) onClose();
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onClick={handleBackdrop}
    >
      <div ref={cardRef} className={`modal-card ${showCloseButton ? 'modal-card--with-close' : ''} ${sizeClass}`.trim()} tabIndex="-1">
        {showCloseButton && onClose && (
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
        {title && <h3 id={titleId}>{title}</h3>}
        {subtitle && <p className="modal-sub">{subtitle}</p>}

        <div className="modal-body">{children}</div>

        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body
    );
}

/**
 * Botón base reutilizable para acciones de modales. Centraliza variantes
 * (.btn-secondary / .btn-primary / .btn-danger), el icono Font Awesome y el
 * estado "ocupado" (reemplaza el contenido por busyLabel y deshabilita).
 */
export function ModalButton({
  variant = 'secondary',
  icon,
  busy = false,
  busyLabel,
  disabled = false,
  children,
  ...rest
}) {
  const variantClass = variant === 'danger'
    ? 'btn-danger'
    : variant === 'primary'
      ? 'btn-primary'
      : 'btn-secondary';
  return (
    <button
      type="button"
      className={`btn ${variantClass}`}
      disabled={disabled || busy}
      {...rest}
    >
      {!busy && icon && <i className={`fa-solid ${icon}`} aria-hidden="true"></i>}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

/** Acción de cancelar: secundaria, icono ✕ por defecto. */
export function ModalCancelButton({ label = 'Cancelar', icon = 'fa-xmark', ...rest }) {
  return <ModalButton variant="secondary" icon={icon} {...rest}>{label}</ModalButton>;
}

/** Acción de confirmar/guardar: primaria (o danger), icono ✓ por defecto. */
export function ModalConfirmButton({
  label = 'Confirmar',
  icon = 'fa-check',
  variant = 'primary',
  busyLabel = 'Procesando...',
  ...rest
}) {
  return (
    <ModalButton variant={variant} icon={icon} busyLabel={busyLabel} {...rest}>
      {label}
    </ModalButton>
  );
}

export function ConfirmModal({
  open,
  title = 'Confirmar acción',
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  extraText,
  extraVariant = 'danger',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  onExtra,
  busy = false,
  confirmDisabled = false,
  children,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      closeOnBackdrop={!busy}
      actions={
        <>
          <ModalCancelButton label={cancelText} onClick={onCancel} disabled={busy} />
          {extraText && onExtra && (
            <ModalButton
              variant={extraVariant}
              icon="fa-rotate-left"
              onClick={onExtra}
              disabled={busy}
            >
              {extraText}
            </ModalButton>
          )}
          <ModalConfirmButton
            label={confirmText}
            variant={confirmVariant}
            onClick={onConfirm}
            busy={busy}
            disabled={confirmDisabled}
          />
        </>
      }
    >
      {children || <div className="confirm-message">{message}</div>}
    </Modal>
  );
}

export default Modal;
