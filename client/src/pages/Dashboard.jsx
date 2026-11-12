import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { paiseToRupees, formatTimestamp } from '../utils/formatters';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import Alert from '../components/Alert';
import {
  AccountCardSkeleton,
  AccountStatusBadge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  StatCardSkeleton,
} from '../components/ui';

function displayName(email) {
  if (!email) return 'there';
  return email.split('@')[0];
}

function isCreditEntry(entry) {
  return String(entry.entry_type || '').toLowerCase() === 'credit';
}

const quickActions = [
  {
    to: '/operations?type=deposit',
    label: 'Deposit',
    description: 'Vault to account',
    icon: ArrowDownLeft,
    iconClass: 'bg-success-soft text-success',
    hover: 'hover:border-success/30 hover:bg-success-soft/40',
  },
  {
    to: '/operations?type=withdraw',
    label: 'Withdraw',
    description: 'Account to vault',
    icon: ArrowUpRight,
    iconClass: 'bg-warning-soft text-warning',
    hover: 'hover:border-warning/30 hover:bg-warning-soft/40',
  },
  {
    to: '/operations?type=transfer',
    label: 'Transfer',
    description: 'Account to account',
    icon: ArrowLeftRight,
    iconClass: 'bg-accent-soft text-accent',
    hover: 'hover:border-accent/30 hover:bg-accent-soft/40',
  },
  {
    to: '/accounts?action=create',
    label: 'New account',
    description: 'Open a ledger',
    icon: PlusCircle,
    iconClass: 'bg-brand-soft text-brand',
    hover: 'hover:border-brand/30 hover:bg-brand-soft/40',
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [recentEntries, setRecentEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listAccounts();
      const allAccounts = list || [];
      setAccounts(allAccounts);

      const customerAccounts = allAccounts.filter((account) => account.account_type === 'customer');
      const recentAccounts = customerAccounts.slice(0, 8);
      const results = await Promise.allSettled(
        recentAccounts.map((account) => api.getAccountStatement(account.id, { limit: 5, offset: 0 }))
      );

      const entries = [];
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const account = recentAccounts[index];
        (result.value.statement || []).forEach((entry) => {
          entries.push({
            ...entry,
            account_number: account.account_number,
            account_id: account.id,
          });
        });
      });

      entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRecentEntries(entries.slice(0, 6));
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const customerAccounts = accounts.filter((account) => account.account_type === 'customer');
  const activeAccounts = customerAccounts.filter((account) => account.status === 'active');
  const systemAccounts = accounts.filter((account) => account.account_type === 'system');

  const totalBalancePaise = customerAccounts.reduce((total, account) => {
    try {
      return total + BigInt(account.current_balance || '0');
    } catch {
      return total;
    }
  }, 0n);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${displayName(user?.email)}`}
        description="Your balances, accounts, and latest ledger activity in one place."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
            <ButtonLink to="/operations" size="sm">
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              Move money
            </ButtonLink>
          </>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <section className="relative overflow-hidden rounded-2xl bg-ink-deep text-[#f8f5ed] shadow-ledger animate-rise">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(680px circle at 6% 0%, rgba(22,121,79,0.35), transparent 55%), radial-gradient(520px circle at 92% 100%, rgba(168,121,43,0.22), transparent 52%)',
          }}
          aria-hidden="true"
        />
        <div className="ledger-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
              Total customer balance
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
              {loading ? (
                <span className="block h-12 w-64 animate-pulse rounded-lg bg-white/10" />
              ) : (
                <span className="text-figure text-[2.6rem] leading-none text-[#fffdf8] sm:text-[3.25rem]">
                  {paiseToRupees(totalBalancePaise)}
                </span>
              )}
              <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse-dot" aria-hidden="true" />
                INR · ledger verified
              </span>
            </div>

            <p className="mt-3 max-w-md text-xs leading-relaxed text-[#f8f5ed]/50">
              Across {customerAccounts.length} customer {customerAccounts.length === 1 ? 'ledger' : 'ledgers'}.
              Every figure is computed from immutable double-entry postings.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link
                to="/operations"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#fffdf8] px-3.5 text-xs font-semibold text-ink-deep transition-transform hover:-translate-y-0.5"
              >
                Move money
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                to="/accounts?action=create"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-[#f8f5ed] transition-colors hover:bg-white/10"
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Open account
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 content-center gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
            <div className="bg-ink-deep/90 p-4">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#f8f5ed]/40">
                Active accounts
              </div>
              <div className="mt-1.5 text-figure text-2xl text-[#fffdf8]">
                {loading ? '—' : activeAccounts.length}
              </div>
              <div className="mt-0.5 text-[10px] text-[#f8f5ed]/40">
                {customerAccounts.length - activeAccounts.length} not active
              </div>
            </div>
            <div className="bg-ink-deep/90 p-4">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#f8f5ed]/40">
                System vaults
              </div>
              <div className="mt-1.5 text-figure text-2xl text-[#fffdf8]">
                {loading ? '—' : systemAccounts.length}
              </div>
              <div className="mt-0.5 text-[10px] text-[#f8f5ed]/40">Settlement ledgers</div>
            </div>
            <div className="col-span-2 flex items-center gap-2.5 bg-ink-deep/90 p-4">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <div>
                <div className="text-[10px] font-semibold text-[#f8f5ed]">
                  {String(user?.role || 'user').toUpperCase()} access
                </div>
                <div className="text-[10px] text-[#f8f5ed]/40">Row-level security on every read</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Customer ledgers"
              value={customerAccounts.length}
              detail={`${activeAccounts.length} active · ${customerAccounts.length - activeAccounts.length} restricted`}
              icon={Wallet}
              tone="brand"
            />
            <StatCard
              label="Ledger integrity"
              value="Verified"
              detail="Zero-sum postings across every transaction"
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Access & security"
              value={String(user?.role || 'user').toUpperCase()}
              detail="Row-level security enforced on every ledger read"
              icon={ShieldCheck}
              tone="info"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="items-center">
          <div>
            <h2 className="text-sm font-semibold text-ink">Quick actions</h2>
            <p className="mt-0.5 text-xs text-muted">Start a common money movement task.</p>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {quickActions.map(({ to, label, description, icon: Icon, iconClass, hover }) => (
              <Link
                key={to}
                to={to}
                className={`group relative flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${hover}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block truncate text-[11px] text-muted">{description}</span>
                </span>
                <ArrowRight
                  className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-soft sm:block"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="items-center">
            <div>
              <h2 className="text-sm font-semibold text-ink">Your accounts</h2>
              <p className="mt-0.5 text-xs text-muted">Customer ledgers you can access.</p>
            </div>
            <Link
              to="/accounts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              Manage accounts <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </CardHeader>

          <CardBody>
            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <AccountCardSkeleton />
                <AccountCardSkeleton />
              </div>
            ) : customerAccounts.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No customer accounts yet"
                description="Open your first account to start depositing, withdrawing, and transferring money."
                action={
                  <ButtonLink to="/accounts?action=create" size="sm">
                    <PlusCircle className="h-4 w-4" aria-hidden="true" />
                    Open first account
                  </ButtonLink>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {customerAccounts.map((account) => (
                  <Link
                    key={account.id}
                    to={`/accounts/${account.id}`}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm"
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-[11px] font-semibold tracking-wide text-muted">
                          {account.account_number}
                        </span>
                        <AccountStatusBadge status={account.status} />
                      </div>
                      <div className="mt-3 text-figure text-xl font-semibold tracking-tight text-ink">
                        {paiseToRupees(account.current_balance)}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                      <span className="font-mono text-[10px] uppercase tracking-wider">
                        {account.currency || 'INR'}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-brand">
                        View statement <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="items-center">
            <div>
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
              <p className="mt-0.5 text-xs text-muted">Latest ledger postings.</p>
            </div>
            <Link to="/accounts" className="text-xs font-semibold text-brand hover:underline">
              Statements
            </Link>
          </CardHeader>

          <CardBody className="p-0">
            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200/70" />
                <div className="h-10 animate-pulse rounded bg-slate-200/70" />
                <div className="h-10 animate-pulse rounded bg-slate-200/70" />
                <div className="h-10 animate-pulse rounded bg-slate-200/70" />
              </div>
            ) : recentEntries.length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No ledger activity yet"
                description="Deposits, withdrawals, and transfers will appear here once they settle."
                action={
                  <ButtonLink to="/operations" size="sm" variant="secondary">
                    Move money
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentEntries.map((entry) => {
                  const credit = isCreditEntry(entry);
                  return (
                    <li key={`${entry.account_id}-${entry.id}`}>
                      <Link
                        to={`/transactions/${entry.transaction_id}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper/70"
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            credit ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                          }`}
                        >
                          {credit ? (
                            <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold capitalize text-ink">
                            {entry.transaction_type || 'transaction'}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-muted">
                            {entry.account_number}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            {formatTimestamp(entry.created_at)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-xs font-bold tabular-nums ${
                            credit ? 'text-success' : 'text-ink'
                          }`}
                        >
                          {credit ? '+' : '−'}
                          {paiseToRupees(entry.amount_paise)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>

          {recentEntries.length > 0 && (
            <CardFooter className="justify-center">
              <Link to="/accounts" className="text-xs font-semibold text-brand hover:underline">
                View account statements
              </Link>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
