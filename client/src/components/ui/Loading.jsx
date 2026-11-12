import React from 'react';

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-slate-200/70 ${className}`}
      aria-hidden="true"
    >
      <span className="shimmer absolute inset-0" />
    </div>
  );
}

export function PageLoading({ label = 'Loading' }) {
  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-4 text-sm text-muted"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand" />
        <span className="h-2 w-2 rounded-full bg-brass" aria-hidden="true" />
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-8 w-36" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  );
}

export function AccountCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-7 w-32" />
      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
