import React from 'react';

function Button({
  children,
  type = 'button',
  variant = 'primary',
  className = '',
  onClick,
  disabled = false,
  ...props
}) {
  const variantClass = variant === 'secondary' ? 'btn-secondary' : 'btn-primary';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
