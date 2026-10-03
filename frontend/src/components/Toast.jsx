import { useState, useEffect, useCallback } from 'react';

let toastListener = null;

/** Call from anywhere to show a toast */
export function showToast(message, type = 'success', duration = 3000) {
  if (toastListener) toastListener({ message, type, duration, id: Date.now() });
}

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    toastListener = (t) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, t.duration);
    };
    return () => { toastListener = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none', width: '90%', maxWidth: 400,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'success' ? '#16a34a' : t.type === 'error' ? '#dc2626' : '#2563eb',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          animation: 'toastSlideUp 0.3s ease-out',
          pointerEvents: 'auto',
          textAlign: 'center',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
