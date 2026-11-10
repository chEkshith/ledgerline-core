import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actions, backTo, backLabel = 'Back', className = '' }) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="flex items-start gap-3">
        {backTo && (
          <Link
            to={backTo}
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft shadow-sm transition-colors hover:bg-slate-50 hover:text-ink"
            aria-label={backLabel}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-brand">{eyebrow}</div>
          )}
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
