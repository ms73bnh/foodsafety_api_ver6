'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // toast(message, { type, duration, onClick })
  const toast = useCallback(
    (message, { type = 'info', duration = 3500, onClick } = {}) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev.slice(-4), { id, message, type, onClick }]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const TYPE_STYLES = {
  success: { bg: '#22c55e', icon: 'fa-circle-check' },
  error:   { bg: '#ef4444', icon: 'fa-circle-xmark' },
  warning: { bg: '#f59e0b', icon: 'fa-triangle-exclamation' },
  info:    { bg: '#0284c7', icon: 'fa-circle-info' },
};

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; }
          to   { opacity: 0; transform: translateY(10px) scale(0.95); }
        }
        .toast-item {
          animation: toastIn 0.25s ease forwards;
        }
      `}</style>
    </>
  );
}

function ToastItem({ toast, onDismiss }) {
  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
  const clickable = !!toast.onClick;

  const handleClick = () => {
    onDismiss(toast.id);
    if (toast.onClick) toast.onClick();
  };

  return (
    <div
      className="toast-item"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: '#1e293b',
        color: '#fff',
        borderRadius: '12px',
        padding: '12px 18px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        minWidth: '260px',
        maxWidth: '440px',
        cursor: clickable ? 'pointer' : 'default',
        borderLeft: `4px solid ${style.bg}`,
        transition: 'opacity 0.15s',
      }}
      onClick={handleClick}
    >
      <i
        className={`fa-solid ${style.icon}`}
        style={{ color: style.bg, fontSize: '1rem', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>{toast.message}</span>
        {clickable && (
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
            클릭하여 이동 →
          </div>
        )}
      </div>
      <i className="fa-solid fa-xmark" style={{ color: '#94a3b8', fontSize: '0.75rem', flexShrink: 0 }} />
    </div>
  );
}
