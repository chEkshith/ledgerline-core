import React from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { LedgerMark } from '../Brand';

function TransactionRow({ icon: Icon, iconClass, title, subtitle, amount, amountClass }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[9px] text-muted">{subtitle}</span>
      </span>
      <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${amountClass}`}>{amount}</span>
    </li>
  );
}

export default function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <p className="sr-only">
        Illustrative LedgerLine workspace preview showing a sample balance, recent sample transactions, and a
        balanced double-entry ledger entry. The values are examples only and are not live financial data.
      </p>

      <div aria-hidden="true" className="relative">
        <div className="pointer-events-none absolute -left-10 top-8 h-44 w-44 rounded-full bg-brand/10 blur-3xl animate-orb" />
        <div
          className="pointer-events-none absolute -right-10 bottom-10 h-52 w-52 rounded-full bg-brass/15 blur-3xl animate-orb"
          style={{ animationDelay: '1.8s' }}
        />
        <div
          className="pointer-events-none absolute left-1/3 -top-12 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl animate-orb"
          style={{ animationDelay: '3.2s' }}
        />

        <div className="absolute -right-3 top-8 z-20 hidden animate-float items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-xl sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success-soft text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[10px] font-semibold text-ink">Transaction posted</span>
            <span className="block text-[9px] text-muted">Balanced ledger entry</span>
          </span>
        </div>

        <div className="absolute -left-4 bottom-20 z-20 hidden animate-float-slow items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-xl sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[10px] font-semibold text-ink">Retry protected</span>
            <span className="block text-[9px] text-muted">Idempotency key</span>
          </span>
        </div>

        <div className="relative z-10 rounded-[26px] border border-line-strong bg-surface p-2 shadow-[0_40px_100px_-36px_rgba(20,33,28,0.45)]">
          <div className="rounded-[20px] border border-line bg-canvas p-4 text-ink sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <LedgerMark className="h-8 w-8" />
                <span className="leading-tight">
                  <span className="block font-display text-xs font-semibold text-ink">LedgerLine</span>
                  <span className="block text-[10px] text-muted">Sample workspace</span>
                </span>
              </div>
              <span className="rounded-full border border-brass/25 bg-brass-soft px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-brass">
                Illustrative
              </span>
            </div>

            <div className="relative mt-4 overflow-hidden rounded-2xl bg-ink-deep p-4 text-[#f8f5ed] shadow-lg">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(320px circle at 90% 0%, rgba(168,121,43,0.25), transparent 60%), radial-gradient(280px circle at 0% 100%, rgba(22,121,79,0.3), transparent 62%)',
                }}
                aria-hidden="true"
              />
              <div className="ledger-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#f8f5ed]/50">
                    Sample customer balance
                  </p>
                  <Wallet className="h-4 w-4 text-[#f8f5ed]/40" aria-hidden="true" />
                </div>
                <p className="mt-1.5 text-figure text-[1.85rem] leading-none text-[#fffdf8] sm:text-[2.15rem]">
                  ₹84,250.00
                </p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[#f8f5ed]/55">
                  <span className="font-mono text-[9px] uppercase tracking-wider">INR · Main account</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Active
                  </span>
                </div>
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
                  iconClass="bg-success-soft text-success"
                  title="Deposit"
                  subtitle="Vault → Main account"
                  amount="+₹12,500.00"
                  amountClass="text-success"
                />
                <TransactionRow
                  icon={ArrowLeftRight}
                  iconClass="bg-accent-soft text-accent"
                  title="Transfer"
                  subtitle="Main → Savings"
                  amount="−₹3,250.00"
                  amountClass="text-ink"
                />
                <TransactionRow
                  icon={ArrowUpRight}
                  iconClass="bg-warning-soft text-warning"
                  title="Withdrawal"
                  subtitle="Main → Vault"
                  amount="−₹1,000.00"
                  amountClass="text-danger"
                />
              </ul>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-ink">Double-entry preview</p>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Balanced
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-paper px-2 py-1.5 text-[10px]">
                  <span className="truncate text-ink-soft">Source account</span>
                  <span className="font-semibold tabular-nums text-danger">−₹500.00</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-paper px-2 py-1.5 text-[10px]">
                  <span className="truncate text-ink-soft">Destination account</span>
                  <span className="font-semibold tabular-nums text-success">+₹500.00</span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                  <Layers className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                  Total
                </span>
                <span className="font-semibold tabular-nums text-ink">₹0.00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
