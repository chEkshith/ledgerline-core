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
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand' : ''}`} aria-hidden="true" />
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
              label="Total customer balance"
              value={paiseToRupees(totalBalancePaise)}
              detail={`Across ${customerAccounts.length} customer ${customerAccounts.length === 1 ? 'account' : 'accounts'}`}
              icon={Wallet}
              tone="brand"
            />
            <StatCard
              label="Active accounts"
              value={activeAccounts.length}
              detail={
                customerAccounts.length === 0
                  ? 'No customer accounts yet'
                  : `${customerAccounts.length - activeAccounts.length} not active · ${systemAccounts.length} system ${
                      systemAccounts.length === 1 ? 'account' : 'accounts'
                    }`
              }
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
            <Link
              to="/operations?type=deposit"
              className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Deposit</span>
                <span className="block text-[11px] text-muted">Vault to account</span>
              </span>
            </Link>

            <Link
              to="/operations?type=withdraw"
              className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-amber-200 hover:bg-amber-50/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Withdraw</span>
                <span className="block text-[11px] text-muted">Account to vault</span>
              </span>
            </Link>

            <Link
              to="/operations?type=transfer"
              className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">Transfer</span>
                <span className="block text-[11px] text-muted">Account to account</span>
              </span>
            </Link>

            <Link
              to="/accounts?action=create"
              className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">New account</span>
                <span className="block text-[11px] text-muted">Open a ledger</span>
              </span>
            </Link>
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
                    className="group flex flex-col justify-between rounded-lg border border-line bg-surface p-4 transition-colors hover:border-brand/30 hover:bg-brand-soft/30"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-[11px] font-semibold tracking-wide text-muted">
                          {account.account_number}
                        </span>
                        <AccountStatusBadge status={account.status} />
                      </div>
                      <div className="mt-3 text-xl font-bold tracking-tight text-ink tabular-nums">
                        {paiseToRupees(account.current_balance)}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                      <span className="capitalize">{account.currency || 'INR'}</span>
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
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
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
