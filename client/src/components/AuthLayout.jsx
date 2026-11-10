import React from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Repeat, ShieldCheck, Layers } from 'lucide-react';

const highlights = [
  {
    icon: Layers,
    title: 'Immutable double-entry postings',
    description: 'Every movement produces a balanced debit and credit you can inspect.',
  },
  {
    icon: ShieldCheck,
    title: 'Integer paise arithmetic',
    description: 'Amounts settle in exact minor units with no floating-point drift.',
  },
  {
    icon: Repeat,
    title: 'Idempotent money movement',
    description: 'Retries are safe. Duplicate requests resolve to the original result.',
  },
];

export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink px-10 py-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(600px circle at 15% 10%, rgba(15,118,110,0.35), transparent 55%), radial-gradient(500px circle at 90% 90%, rgba(37,99,235,0.18), transparent 55%)',
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-tight">LedgerLine</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                Ledger infrastructure
              </span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Money movement with a ledger you can prove.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            A secure financial workspace built around an auditable double-entry ledger, exact minor-currency
            arithmetic, and idempotent transaction processing.
          </p>

          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-300 ring-1 ring-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/55">{description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-[11px] text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          Integer paise · Zero-sum ledger · Verified postings
        </div>
      </aside>

      <main className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between lg:hidden">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-tight text-ink">LedgerLine</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Ledger infrastructure
              </span>
            </span>
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Secure access</span>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
