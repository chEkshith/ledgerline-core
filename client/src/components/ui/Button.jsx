import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const variants = {
  primary:
    'bg-brand text-white border border-transparent shadow-sm hover:bg-brand-hover active:bg-brand-hover',
  secondary:
    'bg-surface text-ink border border-line shadow-sm hover:bg-slate-50 active:bg-slate-100',
  subtle:
    'bg-slate-100 text-ink border border-transparent hover:bg-slate-200 active:bg-slate-200',
  ghost:
    'bg-transparent text-ink-soft border border-transparent hover:bg-slate-100 hover:text-ink',
  success:
    'bg-emerald-600 text-white border border-transparent shadow-sm hover:bg-emerald-700',
  danger:
    'bg-danger text-white border border-transparent shadow-sm hover:bg-red-800',
  dangerSoft:
    'bg-danger-soft text-danger border border-red-200 hover:bg-red-100',
  outlineDanger:
    'bg-surface text-danger border border-red-200 hover:bg-danger-soft',
};

const sizes = {
  xs: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export function buttonStyles({ variant = 'primary', size = 'md', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center font-semibold whitespace-nowrap',
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:opacity-50 disabled:pointer-events-none',
    variants[variant] || variants.primary,
    sizes[size] || sizes.md,
    className,
  ].join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <Link className={buttonStyles({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
