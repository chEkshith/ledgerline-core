import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const variants = {
  primary:
    'border border-transparent bg-brand-solid text-[#fffdf8] shadow-[0_10px_22px_-14px_rgba(14,91,74,0.9)] hover:bg-brand-solid-hover active:translate-y-px',
  secondary:
    'border border-line bg-surface text-ink shadow-[0_1px_2px_rgba(20,33,28,0.05)] hover:border-line-strong hover:bg-paper active:translate-y-px',
  subtle:
    'border border-transparent bg-slate-100 text-ink hover:bg-slate-200 active:translate-y-px',
  ghost:
    'border border-transparent bg-transparent text-ink-soft hover:bg-slate-100 hover:text-ink',
  success:
    'border border-transparent bg-[#16794f] text-white shadow-[0_10px_22px_-14px_rgba(4,120,87,0.8)] hover:bg-[#0f5a3b] active:translate-y-px',
  danger:
    'border border-transparent bg-[#a92f28] text-white shadow-[0_10px_22px_-14px_rgba(169,47,40,0.8)] hover:bg-[#7f231e] active:translate-y-px',
  dangerSoft:
    'border border-danger/30 bg-danger-soft text-danger hover:bg-danger/15',
  outlineDanger:
    'border border-danger/30 bg-surface text-danger hover:bg-danger-soft',
};

const sizes = {
  xs: 'h-8 px-2.5 text-[11px] gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export function buttonStyles({ variant = 'primary', size = 'md', className = '' } = {}) {
  return [
    'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap',
    'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:pointer-events-none disabled:opacity-45',
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
