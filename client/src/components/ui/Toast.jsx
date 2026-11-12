import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const tones = {
  success: {
    icon: CheckCircle2,
    bar: 'bg-success',
    iconClass: 'text-success',
    surface: 'bg-success-soft',
  },
  error: {
    icon: AlertCircle,
    bar: 'bg-danger',
    iconClass: 'text-danger',
    surface: 'bg-danger-soft',
  },
  info: {
    icon: Info,
    bar: 'bg-accent',
    iconClass: 'text-accent',
    surface: 'bg-accent-soft',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, type = 'info', duration = 4200) => {
      if (!message) return;
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current, { id, message, type }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      success: (message, duration) => push(message, 'success', duration),
      error: (message, duration) => push(message, 'error', duration),
      info: (message, duration) => push(message, 'info', duration),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-4 sm:items-end sm:px-6 sm:pb-6"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const tone = tones[toast.type] || tones.info;
          const Icon = tone.icon;
          return (
            <div
              key={toast.id}
              className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 pl-4 shadow-2xl animate-toastIn"
              role="status"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tone.surface}`}>
                <Icon className={`h-3.5 w-3.5 ${tone.iconClass}`} aria-hidden="true" />
              </span>
              <p className="flex-1 pt-0.5 text-sm leading-relaxed text-ink">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
