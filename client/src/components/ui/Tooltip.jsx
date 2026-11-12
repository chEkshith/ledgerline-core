import React from 'react';

export function Tooltip({ label, children, side = 'top', className = '' }) {
  const sideClass =
    side === 'bottom'
      ? 'top-full mt-2'
      : side === 'left'
      ? 'right-full mr-2 top-1/2 -translate-y-1/2'
      : side === 'right'
      ? 'left-full ml-2 top-1/2 -translate-y-1/2'
      : 'bottom-full mb-2';

  return (
    <span className={`group/tt relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 hidden max-w-[220px] whitespace-normal rounded-lg bg-[#0b1712] px-2.5 py-1.5 text-[11px] font-medium leading-snug text-[#f8f5ed] shadow-xl ring-1 ring-white/10 group-hover/tt:block group-focus-within/tt:block ${sideClass}`}
      >
        {label}
      </span>
    </span>
  );
}
