import React from 'react';

function Toast({ toasts = [] }) {
  if (!toasts.length) return null;

  return (
    <div id="toast-container" className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type || 'info'}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default Toast;
