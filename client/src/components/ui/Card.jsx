import React from 'react';

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,27,45,0.04)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-line px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className = '', children, ...props }) {
  return (
    <div className={`px-5 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className = '', children, ...props }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-t border-line px-5 py-3 ${className}`} {...props}>
      {children}
    </div>
  );
}
