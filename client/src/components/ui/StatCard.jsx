import React from 'react';

const tones = {
  brand: 'bg-brand-soft text-brand ring-brand/10',
  info: 'bg-accent-soft text-accent ring-accent/10',
  neutral: 'bg-slate-100 text-ink-soft ring-line',
  success: 'bg-success-soft text-success ring-success/10',
  warning: 'bg-warning-soft text-warning ring-warning/10',
  danger: 'bg-danger-soft text-danger ring-danger/10',
  brass: 'bg-brass-soft text-brass ring-brass/15',
};

export function StatCard({ label, value, detail, icon: Icon, tone = 'brand', className = '' }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-ledger ${className}`}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent"
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</span>
        {Icon && (
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:-translate-y-0.5 ${
              tones[tone] || tones.brand
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-ink text-figure sm:text-[1.7rem]">
        {value}
      </div>
      {detail && <div className="mt-2 text-xs leading-relaxed text-muted">{detail}</div>}
    </div>
  );
}
