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

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:shadow-lg"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main">
        <section id="top" className="relative overflow-hidden bg-[#07111f] text-white">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(900px circle at 10% 10%, rgba(16,185,129,0.18), transparent 55%), radial-gradient(800px circle at 90% 20%, rgba(59,130,246,0.16), transparent 52%), radial-gradient(700px circle at 50% 100%, rgba(139,92,246,0.12), transparent 55%)',
            }}
            aria-hidden="true"
          />
          <div className="landing-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
          <div
            className="pointer-events-none absolute -left-32 top-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl animate-orb"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-32 top-10 h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl animate-orb"
            style={{ animationDelay: '2.2s' }}
            aria-hidden="true"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
                </span>
                Double-entry ledger infrastructure
              </span>

              <h1 className="mt-6 text-balance text-[2.1rem] font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.65rem] xl:text-[4rem]">
                <span className="block">Every transaction has a story.</span>
                <span className="mt-1 block bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-300 bg-clip-text text-transparent">
                  Every ledger tells the truth.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base lg:text-lg">
                Move money with confidence. LedgerLine combines secure financial operations, transparent double-entry
                accounting, and verifiable transaction records in one simple platform.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-3 text-sm font-bold text-[#04101d] shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]"
                >
                  Get Started
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <a
                  href="#features"
                  className="group inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  Explore Features
                  <ArrowDown
                    className="h-4 w-4 text-white/50 transition-transform duration-200 group-hover:translate-y-0.5"
                    aria-hidden="true"
                  />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                  Double-entry by design
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                  Idempotent retries
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-300" aria-hidden="true" />
                  Role-aware access
                </span>
              </div>
            </div>

            <div className="relative lg:pl-4">
              <HeroIllustration />
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-[10px] text-white/35">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" aria-hidden="true" />
                Illustrative product preview · Sample values only
              </p>
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
