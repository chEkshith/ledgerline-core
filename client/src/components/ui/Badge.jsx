import React from 'react';

const variants = {
  neutral: 'border-line bg-paper text-ink-soft',
  brand: 'border-brand/25 bg-brand-soft text-brand',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  danger: 'border-danger/25 bg-danger-soft text-danger',
  info: 'border-accent/25 bg-accent-soft text-accent',
  brass: 'border-brass/30 bg-brass-soft text-brass',
};

export function Badge({ variant = 'neutral', className = '', children, dot = false, ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${variants[variant] || variants.neutral} ${className}`}
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
