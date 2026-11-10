import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Landmark, Menu, X } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Security', href: '#security' },
  { label: 'About', href: '#about' },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <a
          href="#top"
          className="group flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-[#04101d] shadow-lg shadow-emerald-500/20 transition-transform duration-300 group-hover:scale-105">
            <Landmark className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight text-white">LedgerLine</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Ledger infrastructure
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              to="/login"
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="group inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2.5 text-sm font-bold text-[#04101d] shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]"
            >
              Get Started
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>

          <ThemeToggle variant="dark" />

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 lg:hidden"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={open}
            aria-controls="landing-mobile-navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="landing-mobile-navigation"
          className="border-t border-white/10 bg-[#07111f] px-4 pb-5 pt-2 shadow-2xl lg:hidden"
        >
          <nav className="space-y-1" aria-label="Mobile">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-lg border border-white/15 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              Log in
            </Link>
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 px-3 py-2.5 text-sm font-bold text-[#04101d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Get Started
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
