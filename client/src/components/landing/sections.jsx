import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Layers,
  LogIn,
  RefreshCw,
  Scale,
  ScrollText,
  Server,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from 'lucide-react';
import Reveal from './Reveal';

function SectionHeading({ eyebrow, title, description, align = 'left', dark = false }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p
        className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
          dark ? 'text-emerald-300' : 'text-brand'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dark ? 'bg-emerald-400' : 'bg-brand'}`} />
        {eyebrow}
      </p>
      <h2
        className={`mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl ${
          dark ? 'text-white' : 'text-ink'
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-4 text-sm leading-relaxed sm:text-base ${dark ? 'text-white/60' : 'text-muted'}`}>
          {description}
        </p>
      )}
    </div>
  );
}

const trustHighlights = [
  {
    icon: Layers,
    title: 'Double-entry ledger architecture',
    description: 'Every posted movement is represented by balanced debit and credit entries.',
    iconClass: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    icon: RefreshCw,
    title: 'Idempotent transaction processing',
    description: 'Retried requests resolve safely without creating duplicate movements.',
    iconClass: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    icon: UsersRound,
    title: 'Role-based access control',
    description: 'Customers, auditors, and administrators see only what their role permits.',
    iconClass: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  {
    icon: Eye,
    title: 'Transparent transaction records',
    description: 'Status, postings, and references stay visible for inspection.',
    iconClass: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  },
];

export function TrustHighlights() {
  return (
    <section className="border-b border-line bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="sr-only">Built on accountable foundations</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustHighlights.map((highlight, index) => (
            <Reveal key={highlight.title} delay={index * 70} className="h-full">
              <article className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-105 ${highlight.iconClass}`}
                >
                  <highlight.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <h3 className="text-sm font-semibold leading-snug text-ink">{highlight.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{highlight.description}</p>
                </span>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: ArrowLeftRight,
    title: 'Smart Money Movement',
    description: 'Move money through deposits, withdrawals, and transfers with clear transaction status at every step.',
    points: ['Deposits, withdrawals, and transfers', 'Clear transaction status', 'Consistent money representation'],
    iconClass: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    glowClass: 'bg-emerald-400/25',
    borderClass: 'hover:border-emerald-200',
    lineClass: 'from-emerald-400 to-cyan-400',
  },
  {
    icon: BookOpenCheck,
    title: 'Verifiable Ledger',
    description: 'Inspect the debit and credit entries behind every posted transaction and follow the movement end to end.',
    points: ['Matching debit and credit entries', 'Double-entry integrity', 'Transparent transaction details'],
    iconClass: 'bg-blue-50 text-blue-700 ring-blue-100',
    glowClass: 'bg-blue-400/25',
    borderClass: 'hover:border-blue-200',
    lineClass: 'from-blue-400 to-cyan-400',
  },
  {
    icon: RefreshCw,
    title: 'Idempotent Transactions',
    description: 'Retry a request without worrying about duplicate execution. Replays resolve to the original result.',
    points: ['Safer request retries', 'Duplicate-request protection', 'Clear replay behaviour'],
    iconClass: 'bg-violet-50 text-violet-700 ring-violet-100',
    glowClass: 'bg-violet-400/25',
    borderClass: 'hover:border-violet-200',
    lineClass: 'from-violet-400 to-fuchsia-400',
  },
  {
    icon: UsersRound,
    title: 'Access Control',
    description: 'Keep account access intentional with account-holder permissions, auditor visibility, and admin controls.',
    points: ['Account-holder permissions', 'Auditor read-only access', 'Administrative controls'],
    iconClass: 'bg-amber-50 text-amber-700 ring-amber-100',
    glowClass: 'bg-amber-400/25',
    borderClass: 'hover:border-amber-200',
    lineClass: 'from-amber-400 to-orange-400',
  },
  {
    icon: FileText,
    title: 'Account Statements',
    description: 'Review transaction history with running balances and clear references for every ledger entry.',
    points: ['Transaction history', 'Running balances', 'Clear transaction references'],
    iconClass: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    glowClass: 'bg-cyan-400/25',
    borderClass: 'hover:border-cyan-200',
    lineClass: 'from-cyan-400 to-sky-400',
  },
  {
    icon: Activity,
    title: 'Financial Oversight',
    description: 'Monitor transactions, run reversal workflows, and keep system health visible from one workspace.',
    points: ['Transaction monitoring', 'Reversal workflows', 'System health visibility'],
    iconClass: 'bg-rose-50 text-rose-700 ring-rose-100',
    glowClass: 'bg-rose-400/25',
    borderClass: 'hover:border-rose-200',
    lineClass: 'from-rose-400 to-pink-400',
  },
];

export function FeatureShowcase() {
  return (
    <section id="features" className="scroll-mt-24 bg-canvas py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Platform capabilities"
            title="Built for money that must add up."
            description="A focused set of tools for moving money, understanding the ledger, and keeping every operation accountable."
            align="center"
          />
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={(index % 3) * 80} className="h-full">
              <article
                className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-24px_rgba(15,27,45,0.24)] ${feature.borderClass}`}
              >
                <div
                  className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 ${feature.glowClass}`}
                />
                <span
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-105 ${feature.iconClass}`}
                >
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="relative mt-4 text-base font-bold tracking-tight text-ink">{feature.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted">{feature.description}</p>
                <ul className="relative mt-4 space-y-2">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-xs text-ink-soft">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="relative mt-auto pt-5">
                  <div
                    className={`h-1 w-12 rounded-full bg-gradient-to-r transition-all duration-300 group-hover:w-20 ${feature.lineClass}`}
                  />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    icon: ArrowUpRight,
    title: 'Initiate',
    description: 'Start a deposit, withdrawal, or transfer.',
    detail: 'Choose the operation and the accounts involved.',
  },
  {
    icon: ShieldCheck,
    title: 'Validate',
    description: 'Verify permissions, balances, and transaction rules.',
    detail: 'Server-side checks protect every movement.',
  },
  {
    icon: BookOpenCheck,
    title: 'Record',
    description: 'Record the corresponding ledger entries and transaction result.',
    detail: 'The outcome and its balanced postings stay inspectable.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Three steps from intent to ledger."
            description="A deliberate flow keeps money movement understandable from the moment it starts to the entry it leaves behind."
            align="center"
          />
        </Reveal>

        <div className="relative mt-14">
          <div className="pointer-events-none absolute left-[8%] right-[8%] top-10 hidden lg:block" aria-hidden="true">
            <svg className="h-2 w-full" viewBox="0 0 1000 8" preserveAspectRatio="none">
              <defs>
                <linearGradient id="step-flow-gradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="50%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
              <line
                x1="0"
                y1="4"
                x2="1000"
                y2="4"
                stroke="url(#step-flow-gradient)"
                strokeWidth="2"
                strokeDasharray="6 10"
                className="animate-dash-flow"
              />
            </svg>
          </div>

          <ol className="relative grid gap-5 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="relative">
                <Reveal delay={index * 120} className="h-full">
                  <div className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#2563eb] text-white shadow-lg shadow-emerald-900/10">
                        <step.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="font-mono text-xs font-bold tracking-widest text-slate-300">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 text-base font-bold tracking-tight text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">{step.description}</p>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{step.detail}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function LedgerTransparency() {
  return (
    <section id="ledger" className="scroll-mt-24 bg-canvas py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <SectionHeading
              eyebrow="Ledger transparency"
              title="A transfer is more than a balance change."
              description="Every successful transfer creates balanced debit and credit entries, making the movement traceable through the ledger."
            />
            <div className="mt-6 rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start gap-2.5">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-muted">
                  This is an illustrative example only. Balanced entries make movement traceable; zero-sum accounting
                  is not a cryptographic proof and does not by itself prove the absence of fraud.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#07111f] p-5 text-white shadow-[0_32px_90px_-28px_rgba(15,27,45,0.55)] sm:p-7">
              <div
                className="pointer-events-none absolute inset-0 opacity-80"
                style={{
                  background:
                    'radial-gradient(500px circle at 12% 0%, rgba(16,185,129,0.18), transparent 58%), radial-gradient(500px circle at 90% 100%, rgba(59,130,246,0.2), transparent 55%)',
                }}
                aria-hidden="true"
              />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Illustrative ledger entry
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">Transfer · ₹500.00</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Balanced
                  </span>
                </div>

                <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-white/10 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    <span>Account</span>
                    <span>Entry</span>
                  </div>
                  <Reveal
                    as="div"
                    delay={200}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-white/10 px-4 py-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">Source account</span>
                      <span className="mt-0.5 block text-[10px] text-white/40">Debit</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-rose-300">−₹500.00</span>
                  </Reveal>
                  <Reveal
                    as="div"
                    delay={420}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-white/10 px-4 py-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">Destination account</span>
                      <span className="mt-0.5 block text-[10px] text-white/40">Credit</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-emerald-300">+₹500.00</span>
                  </Reveal>
                  <div className="flex items-center justify-between gap-4 px-4 py-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Total</span>
                    <span className="text-lg font-bold tabular-nums text-white">₹0.00</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 text-[11px] text-white/45">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  Sample data · Illustrative only · Not a live transaction
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const securityPoints = [
  {
    icon: Server,
    title: 'Server-side authorization',
    description: 'Authorization decisions are enforced by the server, not the browser.',
  },
  {
    icon: UserCheck,
    title: 'Account membership verification',
    description: 'Account access is checked against membership before an operation proceeds.',
  },
  {
    icon: RefreshCw,
    title: 'Transaction idempotency',
    description: 'Idempotency keys protect retries from creating duplicate movements.',
  },
  {
    icon: ScrollText,
    title: 'Append-only ledger protections',
    description: 'Posted ledger entries are protected against update and deletion.',
  },
  {
    icon: ClipboardCheck,
    title: 'Auditable financial operations',
    description: 'Administrative actions retain actor attribution for review.',
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="relative scroll-mt-24 overflow-hidden bg-[#07111f] py-20 text-white sm:py-24">
      <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl animate-orb"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl animate-orb"
        style={{ animationDelay: '2.4s' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <Reveal>
            <SectionHeading
              eyebrow="Security by construction"
              title="Trust isn't a feature. It's built into every transaction."
              description="LedgerLine keeps the important controls close to the money movement itself, so every operation has a clear path and a reviewable outcome."
              dark
            />
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-xs leading-relaxed text-white/55">
                Controls are enforced in the application and database layers that handle financial operations.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {securityPoints.map((point, index) => (
              <Reveal key={point.title} delay={index * 80} className="h-full">
                <div className="group flex h-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors duration-300 hover:border-emerald-400/25 hover:bg-white/[0.05]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-emerald-300 ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105">
                    <point.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <h3 className="text-sm font-semibold text-white">{point.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">{point.description}</p>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const principles = [
  {
    icon: Eye,
    title: 'Explainable by default',
    description: 'The ledger, transaction status, and posting context stay visible instead of disappearing behind a balance.',
  },
  {
    icon: Scale,
    title: 'Exact by design',
    description: 'Money is handled in integer minor units, keeping calculations consistent from request to record.',
  },
  {
    icon: ClipboardCheck,
    title: 'Accountable operations',
    description: 'Permissions, idempotency, and review workflows make every movement easier to understand and verify.',
  },
];

export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-24 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <Reveal>
            <SectionHeading
              eyebrow="About LedgerLine"
              title="A clearer way to account for money movement."
              description="LedgerLine is a demonstration financial application built around a simple idea: every movement should be explainable. The workspace surfaces the ledger, transaction status, and verification context instead of hiding them behind a balance number."
            />
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
              It is designed as a practical showcase of financial software architecture, not a regulated financial
              service. Sample values and ledger entries on this page are illustrative only.
            </p>
          </Reveal>

          <div className="grid gap-3">
            {principles.map((principle, index) => (
              <Reveal key={principle.title} delay={index * 90}>
                <div className="group flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-emerald-100 transition-transform duration-300 group-hover:scale-105">
                    <principle.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <h3 className="text-sm font-bold text-ink">{principle.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{principle.description}</p>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="bg-[#07111f] px-4 pb-20 pt-4 sm:px-6 sm:pb-24 lg:px-8">
      <Reveal className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0f766e] via-[#0e7490] to-[#1d4ed8] px-6 py-14 text-center shadow-[0_40px_100px_-30px_rgba(29,78,216,0.55)] sm:px-10 sm:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(420px circle at 10% 20%, rgba(255,255,255,0.4), transparent 55%), radial-gradient(420px circle at 90% 80%, rgba(34,211,238,0.45), transparent 55%)',
            }}
            aria-hidden="true"
          />
          <div className="landing-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="relative mx-auto max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Start with the ledger</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              Make every movement count.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Experience financial operations built around accountability, transparency, and trust.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#07111f] shadow-lg transition-all duration-200 hover:bg-emerald-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f766e] sm:w-auto"
              >
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Log In
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
