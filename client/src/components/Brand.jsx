import React from 'react';
import { Link } from 'react-router-dom';

const markTones = {
  brand:
    'bg-gradient-to-br from-[#0e5b4a] via-[#0f6452] to-[#147a63] text-[#f8f5ed] shadow-[0_10px_24px_-14px_rgba(14,91,74,0.9)]',
  light: 'bg-[#f8f5ed] text-[#0e5b4a] shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)]',
  outline:
    'border border-[rgba(255,253,248,0.18)] bg-[rgba(255,253,248,0.08)] text-[#f8f5ed]',
};

export function LedgerMark({ className = 'h-9 w-9', tone = 'brand' }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${markTones[tone] || markTones.brand} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-[62%] w-[62%]">
        <path
          d="M8.5 10.5h15M8.5 16h9.5M8.5 21.5h12.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="23.5" cy="16" r="1.7" fill="#b8892d" />
      </svg>
    </span>
  );
}

export function Brand({
  to = '/dashboard',
  tone = 'default',
  subtitle = 'Ledger infrastructure',
  compact = false,
  className = '',
  onClick,
}) {
  const onDark = tone === 'onDark';
  const markTone = onDark ? 'light' : 'brand';

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${className}`}
    >
      <LedgerMark tone={markTone} className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-3" />
      {!compact && (
        <span className="leading-tight">
          <span
            className={`block font-display text-[17px] font-semibold tracking-tight ${
              onDark ? 'text-[#f8f5ed]' : 'text-ink'
            }`}
          >
            LedgerLine
          </span>
          <span
            className={`block text-[9px] font-semibold uppercase tracking-[0.22em] ${
              onDark ? 'text-[#f8f5ed]/45' : 'text-muted'
            }`}
          >
            {subtitle}
          </span>
        </span>
      )}
    </Link>
  );
}
