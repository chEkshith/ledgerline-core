import React from 'react';

const variants = {
  neutral: 'bg-slate-100 text-ink-soft border-slate-200',
  brand: 'bg-brand-soft text-brand border-emerald-200',
  success: 'bg-success-soft text-success border-emerald-200',
  warning: 'bg-warning-soft text-warning border-amber-200',
  danger: 'bg-danger-soft text-danger border-red-200',
  info: 'bg-accent-soft text-accent border-blue-200',
};

export function Badge({ variant = 'neutral', className = '', children, dot = false, ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${variants[variant] || variants.neutral} ${className}`}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const accountStatusVariant = {
  active: 'success',
  frozen: 'warning',
  closed: 'danger',
};

const transactionStatusVariant = {
  posted: 'success',
  success: 'success',
  pending: 'warning',
  refused: 'danger',
};

export function AccountStatusBadge({ status, className = '' }) {
  const normalized = String(status || '').toLowerCase();
  return (
    <Badge variant={accountStatusVariant[normalized] || 'neutral'} dot className={className}>
      {status || 'unknown'}
    </Badge>
  );
}

export function TransactionStatusBadge({ status, className = '' }) {
  const normalized = String(status || '').toLowerCase();
  return (
    <Badge variant={transactionStatusVariant[normalized] || 'neutral'} dot className={className}>
      {status || 'unknown'}
    </Badge>
  );
}

export function EntryTypeBadge({ type, className = '' }) {
  const isCredit = String(type || '').toLowerCase() === 'credit';
  return (
    <Badge variant={isCredit ? 'success' : 'danger'} className={className}>
      {isCredit ? 'Credit' : 'Debit'}
    </Badge>
  );
}
