import React, { useEffect, useRef } from 'react';

/**
 * Ventana de ficha reutilizable (ficha de cliente, ficha de usuario, …).
 * Cabecera con el patrón unificado `.section-title-with-back`: `Volver` primero a
 * la izquierda (mismos botones .panel-header-action / .btn-back que en los paneles),
 * título y subtítulo a su derecha y acciones restantes —si las hubiera— a fondo de
 * fila. Vive en el flujo del panel —sin overlay ni bloqueo de scroll— para que
 * los toasts siempre se vean.
 */
function DetailWindow({
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = 'Volver',
  closeDisabled = false,
  className = '',
  children,
}) {
  const rootRef = useRef(null);

  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <section
      ref={rootRef}
      className={`detail-window view-enter ${className}`.trim()}
      role="region"
      aria-label={title}
    >
      <div className="detail-window-header section-title section-title-with-back">
        {onClose && (
          <button
            type="button"
            className="btn btn-primary btn-sm panel-header-action btn-back mobile-icon-only"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={closeLabel}
          >
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            <span className="mobile-action-label">{closeLabel}</span>
          </button>
        )}
        <div className="section-title-text">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="detail-window-actions">{actions}</div>}
      </div>

      <div className="detail-window-body">{children}</div>
    </section>
  );
}

export default DetailWindow;
