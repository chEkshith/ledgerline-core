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
        className={`pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover/tt:block group-focus-within/tt:block ${sideClass}`}
      >
        {label}
      </span>
    </span>
  );
}
