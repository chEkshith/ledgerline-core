import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '../Brand';

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Ledger transparency', href: '#ledger' },
  { label: 'Security', href: '#security' },
  { label: 'About', href: '#about' },
];

export default function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-ink-deep text-[#f8f5ed]">
      <div className="ledger-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-brass/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div className="max-w-sm">
            <Brand
              tone="onDark"
              to="/"
              className="inline-flex"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            />
            <p className="mt-4 text-sm leading-relaxed text-[#f8f5ed]/50">
              Money movement with a ledger you can prove. Secure financial operations, transparent double-entry
              accounting, and verifiable transaction records in one workspace.
            </p>
            <div className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#f8f5ed]/30">
              <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
              Integer paise · Zero-sum · Verified
            </div>
          </div>

          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f8f5ed]/40">Product</h2>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-[#f8f5ed]/60 transition-colors hover:text-[#fffdf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f8f5ed]/40">Account</h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  to="/login"
                  className="text-sm text-[#f8f5ed]/60 transition-colors hover:text-[#fffdf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1 text-sm text-[#f8f5ed]/60 transition-colors hover:text-[#fffdf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                  Create an account
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            </ul>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <p className="text-[11px] font-semibold text-[#f8f5ed]/70">Built around the ledger</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#f8f5ed]/40">
                Double-entry postings, idempotent retries, and role-aware access.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="max-w-4xl text-[11px] leading-relaxed text-[#f8f5ed]/35">
            LedgerLine is a demonstration financial application built to showcase secure money movement and
            double-entry ledger design. Sample values shown on this page are illustrative only and are not live
            financial data, customer balances, or a regulated financial service.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-[11px] text-[#f8f5ed]/35 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} LedgerLine. All rights reserved.</span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-4 rounded-full bg-brass/70" aria-hidden="true" />
              Built for accountable money movement.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
