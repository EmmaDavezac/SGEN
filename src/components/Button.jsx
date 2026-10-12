import React from 'react';

function Button({
  children,
  type = 'button',
  variant = 'primary',
  className = '',
  onClick,
  disabled = false,
  busy = false,
  busyText = 'Procesando...',
  icon,
  label,
  ...props
}) {
  const variantClass = variant === 'secondary'
    ? 'btn-secondary'
    : variant === 'danger'
      ? 'btn-danger'
      : 'btn-primary';

  const content = label !== undefined ? (
    <>
      {icon && <i className={`fa-solid ${icon}`} aria-hidden="true"></i>}
      <span className="mobile-action-label">{label}</span>
    </>
  ) : children;

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      {...props}
    >
      {busy ? busyText : content}
    </button>
  );
}

/**
 * Botón Cancelar unificado para formularios inline de paneles:
 * icono ✕ + texto en desktop, solo icono en móvil (vía .mobile-icon-only).
 */
export function PanelCancelButton({ label = 'Cancelar', icon = 'fa-xmark', className = '', ...rest }) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={`mobile-icon-only ${className}`.trim()}
      icon={icon}
      label={label}
      {...rest}
    />
  );
}

/**
 * Botón Guardar unificado para formularios inline de paneles:
 * icono + texto en desktop, solo icono en móvil (vía .mobile-icon-only),
 * con estado busy que muestra busyLabel y deshabilita.
 */
export function PanelSaveButton({
  label = 'Guardar',
  icon = 'fa-floppy-disk',
  busy = false,
  busyLabel,
  type = 'submit',
  className = '',
  ...rest
}) {
  return (
    <Button
      type={type}
      variant="primary"
      className={`mobile-icon-only ${className}`.trim()}
      icon={icon}
      label={label}
      busy={busy}
      busyText={busyLabel || `${label}…`}
      {...rest}
    />
  );
}

/**
 * Botón de tarjeta de listado unificado: icono + texto en desktop,
 * solo icono en móvil (vía .mobile-icon-only + .list-icon-btn).
 * Reutiliza la familia .card-icon-btn para conservar los colores.
 */
const LIST_VARIANT_CLASS = {
  primary: 'card-icon-btn--primary',
  danger: 'card-icon-btn--danger',
  success: 'card-icon-btn--success',
  warning: 'card-icon-btn--warning',
  info: 'card-icon-btn--info',
  whatsapp: 'card-icon-btn--whatsapp',
};

export function ListIconButton({
  icon,
  iconStyle = 'solid',
  label,
  title,
  variant = 'primary',
  className = '',
  ...rest
}) {
  const accessibleLabel = rest['aria-label'] || title || label;
  return (
    <button
      type="button"
      className={`card-icon-btn list-icon-btn mobile-icon-only ${LIST_VARIANT_CLASS[variant] || ''} ${className}`.trim()}
      title={title || label}
      aria-label={accessibleLabel}
      {...rest}
    >
      <i className={`fa-${iconStyle} ${icon}`} aria-hidden="true"></i>
      {label && <span className="mobile-action-label">{label}</span>}
    </button>
  );
}

/**
 * Botón de acción de ficha (detalle de cliente/usuario): icono + texto en
 * desktop, solo icono en móvil. Equivalente a ListIconButton pero con el
 * tamaño .btn-sm de los botones de ficha.
 */
export function DetailActionButton({
  icon,
  iconStyle = 'solid',
  label,
  variant = 'secondary',
  className = '',
  iconOnlyOnMobile = true,
  children,
  ...rest
}) {
  const content = label !== undefined ? (
    <>
      <i className={`fa-${iconStyle} ${icon}`} aria-hidden="true"></i>
      <span className="mobile-action-label">{label}</span>
    </>
  ) : children;
  return (
    <Button
      type="button"
      variant={variant}
      className={`btn-sm ${iconOnlyOnMobile ? 'mobile-icon-only' : ''} ${className}`.trim()}
      {...rest}
    >
      {content}
    </Button>
  );
}

export default Button;
