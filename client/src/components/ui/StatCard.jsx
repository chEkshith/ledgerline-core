import React from 'react';

const tones = {
  brand: 'bg-brand-soft text-brand',
  info: 'bg-accent-soft text-accent',
  neutral: 'bg-slate-100 text-ink-soft',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
};

export function StatCard({ label, value, detail, icon: Icon, tone = 'brand', className = '' }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(15,27,45,0.04)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</span>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone] || tones.brand}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</div>
      {detail && <div className="mt-2 text-xs text-muted">{detail}</div>}
    </div>
  );
}
