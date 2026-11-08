import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export default function Alert({ type = 'info', message, onClose }) {
  if (!message) return null;

  const styles = {
    info: 'bg-cyan-950/50 border-cyan-500/40 text-cyan-200',
    success: 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200',
    warning: 'bg-amber-950/50 border-amber-500/40 text-amber-200',
    error: 'bg-rose-950/50 border-rose-500/40 text-rose-200',
  };

  const icons = {
    info: <Info className="w-5 h-5 text-cyan-400 shrink-0" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
  };

  return (
    <div className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${styles[type] || styles.info}`}>
      <div className="flex items-start gap-3">
        {icons[type] || icons.info}
        <div className="text-sm leading-relaxed">{message}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
