import React from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  Layers,
  ShieldCheck,
  Wallet,
} from 'lucide-react';

function TransactionRow({ icon: Icon, iconClass, title, subtitle, amount, amountClass }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-2.5 py-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[9px] text-muted">{subtitle}</span>
      </span>
      <span className={`shrink-0 text-[10px] font-bold tabular-nums ${amountClass}`}>{amount}</span>
    </li>
  );
}

export default function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <p className="sr-only">
        Illustrative LedgerLine workspace preview showing a sample balance, recent sample transactions, and a balanced
        double-entry ledger entry. The values are examples only and are not live financial data.
      </p>

      <div aria-hidden="true" className="relative">
        <div className="pointer-events-none absolute -left-10 top-8 h-44 w-44 rounded-full bg-emerald-500/20 blur-3xl animate-orb" />
        <div
          className="pointer-events-none absolute -right-10 bottom-10 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl animate-orb"
          style={{ animationDelay: '1.8s' }}
        />
        <div
          className="pointer-events-none absolute left-1/3 -top-12 h-32 w-32 rounded-full bg-violet-500/15 blur-3xl animate-orb"
          style={{ animationDelay: '3.2s' }}
        />

        <div className="absolute -right-3 top-8 z-20 hidden animate-float items-center gap-2 rounded-xl border border-emerald-400/20 bg-[#07111f] px-3 py-2 text-white shadow-2xl sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[10px] font-semibold">Transaction posted</span>
            <span className="block text-[9px] text-white/50">Balanced ledger entry</span>
          </span>
        </div>

        <div className="absolute -left-4 bottom-20 z-20 hidden animate-float-slow items-center gap-2 rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-white shadow-2xl sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[10px] font-semibold">Retry protected</span>
            <span className="block text-[9px] text-white/50">Idempotency key</span>
          </span>
        </div>

        <div className="relative z-10 rounded-[28px] border border-white/10 bg-[#0a1627] p-2.5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)]">
          <div className="rounded-[22px] border border-white/10 bg-[#f7f9fc] p-4 text-ink sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
                  <Landmark className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="leading-tight">
                  <span className="block text-xs font-bold text-ink">LedgerLine</span>
                  <span className="block text-[10px] text-muted">Sample workspace</span>
                </span>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                Illustrative
              </span>
            </div>

            <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#0f766e] via-[#0d9488] to-[#2563eb] p-4 text-white shadow-lg shadow-emerald-900/20 animate-gradient-pan">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/65">Sample customer balance</p>
                <Wallet className="h-4 w-4 text-white/60" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">₹84,250.00</p>
              <div className="mt-3 flex items-center justify-between text-[10px] text-white/70">
                <span>INR · Main account</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Active
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-ink">Recent activity</p>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">Sample data</span>
              </div>
              <ul className="mt-2 space-y-1.5">
                <TransactionRow
                  icon={ArrowDownLeft}
                  iconClass="bg-emerald-50 text-emerald-700"
                  title="Deposit"
                  subtitle="Vault → Main account"
                  amount="+₹12,500.00"
                  amountClass="text-emerald-700"
                />
                <TransactionRow
                  icon={ArrowLeftRight}
                  iconClass="bg-blue-50 text-blue-700"
                  title="Transfer"
                  subtitle="Main → Savings"
                  amount="−₹3,250.00"
                  amountClass="text-ink"
                />
                <TransactionRow
                  icon={ArrowUpRight}
                  iconClass="bg-amber-50 text-amber-700"
                  title="Withdrawal"
                  subtitle="Main → Vault"
                  amount="−₹1,000.00"
                  amountClass="text-rose-600"
                />
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-ink">Double-entry preview</p>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Balanced
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-slate-50 px-2 py-1.5 text-[10px]">
                  <span className="truncate text-ink-soft">Source account</span>
                  <span className="font-semibold tabular-nums text-rose-600">−₹500.00</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-slate-50 px-2 py-1.5 text-[10px]">
                  <span className="truncate text-ink-soft">Destination account</span>
                  <span className="font-semibold tabular-nums text-emerald-700">+₹500.00</span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                  <Layers className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                  Total
                </span>
                <span className="font-bold tabular-nums text-ink">₹0.00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
