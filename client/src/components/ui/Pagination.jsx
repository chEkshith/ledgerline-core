import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({ total, limit, offset, onChange, label = 'entries' }) {
  if (!total || total <= limit) return null;

  const start = Math.min(offset + 1, total);
  const end = Math.min(offset + limit, total);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-paper/50 px-5 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
      <div>
        Showing <span className="font-semibold text-ink">{start}</span>–
        <span className="font-semibold text-ink">{end}</span> of{' '}
        <span className="font-semibold text-ink">{total}</span> {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="mr-1 hidden sm:inline">
          Page {page} of {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
