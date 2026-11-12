import React from 'react';

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-2xl bg-brass-soft/70 blur-md" aria-hidden="true" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-paper text-brand shadow-sm">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      )}
      <h3 className="font-display text-base font-semibold tracking-tight text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
