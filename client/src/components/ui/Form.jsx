import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const controlBase =
  'w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-slate-400 shadow-sm transition-colors ' +
  'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export function Field({ label, htmlFor, hint, error, required, className = '', children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', icon: Icon, error, ...props }) {
  const inputClass = `${controlBase} h-10 px-3 ${Icon ? 'pl-9' : ''} ${
    error ? 'border-red-300 focus:border-danger focus:ring-danger/15' : 'border-line'
  } ${className}`;

  if (!Icon) return <input className={inputClass} aria-invalid={!!error} {...props} />;

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input className={inputClass} aria-invalid={!!error} {...props} />
    </div>
  );
}

export function Select({ className = '', error, children, ...props }) {
  return (
    <select
      className={`${controlBase} h-10 px-3 pr-8 ${
        error ? 'border-red-300 focus:border-danger focus:ring-danger/15' : 'border-line'
      } ${className}`}
      aria-invalid={!!error}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = '', error, ...props }) {
  return (
    <textarea
      className={`${controlBase} min-h-24 px-3 py-2.5 ${
        error ? 'border-red-300 focus:border-danger focus:ring-danger/15' : 'border-line'
      } ${className}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

export function PasswordInput({ className = '', error, id, icon: Icon, ...props }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      )}
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        className={`${controlBase} h-10 pr-11 ${Icon ? 'pl-9' : 'pl-3'} ${
          error ? 'border-red-300 focus:border-danger focus:ring-danger/15' : 'border-line'
        } ${className}`}
        aria-invalid={!!error}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink-soft"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function InputPrefix({ prefix, children }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
        {prefix}
      </span>
      <div className="[&_input]:pl-8">{children}</div>
    </div>
  );
}
