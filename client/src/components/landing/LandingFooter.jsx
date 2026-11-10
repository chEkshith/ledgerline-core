import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Landmark } from 'lucide-react';

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Ledger Transparency', href: '#ledger' },
  { label: 'Security', href: '#security' },
  { label: 'About', href: '#about' },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#050c16] text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div className="max-w-sm">
            <a
              href="#top"
              className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-[#04101d]">
                <Landmark className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="leading-tight">
                <span className="block text-base font-bold tracking-tight">LedgerLine</span>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Ledger infrastructure
                </span>
              </span>
            </a>
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              Money movement with a ledger you can prove. Secure financial operations, transparent double-entry
              accounting, and verifiable transaction records in one workspace.
            </p>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Product</h2>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Account</h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  to="/login"
                  className="text-sm text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Create an account
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            </ul>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold text-white/70">Built around the ledger</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                Double-entry postings, idempotent retries, and role-aware access.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="max-w-4xl text-[11px] leading-relaxed text-white/35">
            LedgerLine is a demonstration financial application built to showcase secure money movement and
            double-entry ledger design. Sample values shown on this page are illustrative only and are not live
            financial data, customer balances, or a regulated financial service.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-[11px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} LedgerLine. All rights reserved.</span>
            <span>Built for accountable money movement.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
