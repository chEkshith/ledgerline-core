import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Layers, Repeat, ShieldCheck } from 'lucide-react';
import { Brand } from './Brand';
import ThemeToggle from './ThemeToggle';

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
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.02fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-deep px-10 py-12 text-[#f8f5ed] lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(720px circle at 12% 8%, rgba(22,121,79,0.32), transparent 58%), radial-gradient(560px circle at 96% 92%, rgba(168,121,43,0.2), transparent 55%)',
          }}
          aria-hidden="true"
        />
        <div className="ledger-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl animate-orb"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl animate-orb"
          style={{ animationDelay: '2.4s' }}
          aria-hidden="true"
        />

        <div className="relative">
          <Brand to="/" tone="onDark" />
        </div>

        <div className="relative max-w-lg">
          <div className="ledger-rule-dark w-16" aria-hidden="true" />
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/70">
            Ledger-grade clarity
          </p>
          <h2 className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight">
            Money movement with a ledger you can prove.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#f8f5ed]/60">
            A secure financial workspace built around an auditable double-entry ledger, exact minor-currency
            arithmetic, and idempotent transaction processing.
          </p>

          <ul className="mt-9 space-y-4">
            {highlights.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-emerald-300 ring-1 ring-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#f8f5ed]">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[#f8f5ed]/50">{description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#f8f5ed]/35">
          <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
          Integer paise · Zero-sum ledger · Verified postings
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
          style={{
            background:
              'radial-gradient(520px circle at 80% 0%, rgba(168,121,43,0.1), transparent 70%), radial-gradient(520px circle at 10% 0%, rgba(14,91,74,0.06), transparent 70%)',
          }}
          aria-hidden="true"
        />

        <div className="relative flex items-center justify-between lg:hidden">
          <Brand to="/" />
          <ThemeToggle />
        </div>

        <div className="relative hidden items-center justify-between lg:flex">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to home
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">Secure access</span>
            <ThemeToggle />
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md animate-fadeIn">{children}</div>
        </div>

        <p className="relative text-center text-[10px] leading-relaxed text-slate-400">
          LedgerLine is a demonstration financial application. Values shown after sign-in are your actual
          workspace records.
        </p>
      </main>
    </div>
  );
}
