import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Layers, RefreshCw, ShieldCheck } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import LandingFooter from '../components/landing/LandingFooter';
import HeroIllustration from '../components/landing/HeroIllustration';
import {
  AboutSection,
  FeatureShowcase,
  FinalCta,
  HowItWorks,
  LedgerTransparency,
  SecuritySection,
  TrustHighlights,
} from '../components/landing/sections';

const heroProof = [
  { icon: Layers, label: 'Double-entry by design' },
  { icon: RefreshCw, label: 'Idempotent retries' },
  { icon: ShieldCheck, label: 'Role-aware access' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only rounded-lg bg-brand-solid px-4 py-2 text-sm font-semibold text-[#fffdf8] focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:shadow-lg"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main">
        <section id="top" className="relative overflow-hidden border-b border-line bg-canvas">
          <div className="paper-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(820px circle at 88% 6%, rgba(168,121,43,0.13), transparent 55%), radial-gradient(880px circle at 4% 24%, rgba(14,91,74,0.1), transparent 55%)',
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -left-24 top-40 h-80 w-80 rounded-full bg-brand/5 blur-3xl animate-orb"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-24 top-10 h-96 w-96 rounded-full bg-brass/10 blur-3xl animate-orb"
            style={{ animationDelay: '2.2s' }}
            aria-hidden="true"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12 lg:px-8 lg:pb-24 lg:pt-24">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft shadow-sm backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brass/50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brass" />
                </span>
                Double-entry ledger infrastructure
              </span>

              <h1 className="mt-6 text-balance font-display text-[2.5rem] font-semibold leading-[1.04] tracking-tight text-ink sm:text-[3.4rem] lg:text-[4rem] xl:text-[4.4rem]">
                Money movement
                <span className="mt-1 block text-brand">
                  with a ledger <span className="italic">you can prove.</span>
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-soft/80 sm:text-base lg:text-[1.05rem]">
                LedgerLine combines secure financial operations, transparent double-entry accounting, and
                verifiable transaction records in one calm, auditable workspace.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-solid px-5 py-3 text-sm font-semibold text-[#fffdf8] shadow-ledger transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Open your ledger
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <a
                  href="#features"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Explore the ledger
                  <ArrowDown
                    className="h-4 w-4 text-muted transition-transform duration-200 group-hover:translate-y-0.5"
                    aria-hidden="true"
                  />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-muted">
                {heroProof.map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative lg:pl-4">
              <HeroIllustration />
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-[10px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
                Illustrative product preview · Sample values only
              </p>
            </div>
          </div>

          <div className="relative border-t border-line bg-surface/60">
            <div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-line px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
              {[
                ['Exact', 'Integer paise arithmetic'],
                ['Balanced', 'Zero-sum ledger postings'],
                ['Repeatable', 'Idempotent settlement'],
              ].map(([value, label]) => (
                <div key={label} className="flex items-baseline gap-3 px-1 py-4 sm:justify-center sm:px-6">
                  <span className="font-display text-sm font-semibold text-ink">{value}</span>
                  <span className="text-[11px] text-muted">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <TrustHighlights />
        <FeatureShowcase />
        <HowItWorks />
        <LedgerTransparency />
        <SecuritySection />
        <AboutSection />
        <FinalCta />
      </main>

      <LandingFooter />
    </div>
  );
}
