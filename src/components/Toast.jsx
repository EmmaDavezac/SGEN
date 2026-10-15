import React from 'react';
import Toast from './Toast.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { ToastContext } from './ToastContext.jsx';

export default function ToastContainer() {
  return <ToastProvider><Toast /></ToastProvider>;
  const ctx = React.useContext(ToastContext);
  if (!ctx || !ctx.toasts || ctx.toasts.length === 0) return null;

  return (
    <div className="toast-container" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999 }}>
      {ctx.toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
