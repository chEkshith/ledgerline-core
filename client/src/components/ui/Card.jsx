import React from 'react';

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface shadow-ledger ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardBody({ className = '', children, ...props }) {
  return (
    <div className={`px-5 py-4 sm:px-6 sm:py-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className = '', children, ...props }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-t border-line bg-paper/60 px-5 py-3 sm:px-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
