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
  ...props
}) {
  const variantClass = variant === 'secondary'
    ? 'btn-secondary'
    : variant === 'danger'
      ? 'btn-danger'
      : 'btn-primary';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      {...props}
    >
      {busy ? busyText : children}
    </button>
  );
}

export default Button;
