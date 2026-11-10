import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export default function Alert({ type = 'info', message, onClose }) {
  if (!message) return null;

  const styles = {
    info: 'bg-accent-soft border-blue-200 text-blue-900',
    success: 'bg-success-soft border-emerald-200 text-emerald-900',
    warning: 'bg-warning-soft border-amber-200 text-amber-900',
    error: 'bg-danger-soft border-red-200 text-red-900',
  };

  const icons = {
    info: <Info className="h-4 w-4 shrink-0 text-accent" />,
    success: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />,
    warning: <AlertCircle className="h-4 w-4 shrink-0 text-warning" />,
    error: <AlertCircle className="h-4 w-4 shrink-0 text-danger" />,
  };

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3 ${styles[type] || styles.info}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-2.5">
        {icons[type] || icons.info}
        <div className="text-sm leading-relaxed">{message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Dismiss alert"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
