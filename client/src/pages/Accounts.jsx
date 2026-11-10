import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../services/api';
import { paiseToRupees, formatTimestamp } from '../utils/formatters';
import {
  Wallet,
  PlusCircle,
  Search,
  ExternalLink,
  RefreshCw,
  Building,
  Copy,
  Check,
  ArrowLeftRight,
  Layers,
  CircleDollarSign,
} from 'lucide-react';
import Alert from '../components/Alert';
import Modal from '../components/Modal';
import {
  AccountCardSkeleton,
  AccountStatusBadge,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatCardSkeleton,
  useToast,
} from '../components/ui';

export default function Accounts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newCurrency, setNewCurrency] = useState('INR');
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAccounts();
      setAccounts(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      generateSampleAccNumber();
      setIsModalOpen(true);
    }
  }, [searchParams]);

  function closeModal() {
    setIsModalOpen(false);
    if (searchParams.get('action')) {
      setSearchParams({}, { replace: true });
    }
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    if (!newAccNumber.trim()) {
      setError('Please provide an account number');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createAccount(newAccNumber.trim(), newCurrency);
      toast.success(`Account ${res.accountNumber} created successfully`);
      setIsModalOpen(false);
      setNewAccNumber('');
      setSearchParams({}, { replace: true });
      await loadAccounts();
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  }

  function generateSampleAccNumber() {
    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
    setNewAccNumber(`ACC-IN-${randomSuffix}`);
  }

  async function copyAccountNumber(account) {
    try {
      await navigator.clipboard.writeText(account.account_number);
      setCopiedId(account.id);
      setTimeout(() => setCopiedId((current) => (current === account.id ? null : current)), 1600);
    } catch {
      toast.error('Could not copy account number');
    }
  }

  const filteredAccounts = accounts.filter((acc) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      acc.account_number?.toLowerCase().includes(query) ||
      acc.id?.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const customerAccounts = accounts.filter((account) => account.account_type === 'customer');
  const activeAccounts = customerAccounts.filter((account) => account.status === 'active');
  const systemAccounts = accounts.filter((account) => account.account_type === 'system');
  const totalCustomerPaise = customerAccounts.reduce((total, account) => {
    try {
      return total + BigInt(account.current_balance || '0');
    } catch {
      return total;
    }
  }, 0n);

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Accounts"
        title="Accounts"
        description="Customer ledgers and system vaults, isolated with row-level security."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadAccounts} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand' : ''}`} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                generateSampleAccNumber();
                setIsModalOpen(true);
              }}
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Open account
            </Button>
          </>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Customer balance"
              value={paiseToRupees(totalCustomerPaise)}
              detail={`${customerAccounts.length} customer ${customerAccounts.length === 1 ? 'ledger' : 'ledgers'}`}
              icon={CircleDollarSign}
              tone="brand"
            />
            <StatCard
              label="Active accounts"
              value={activeAccounts.length}
              detail={`${customerAccounts.length - activeAccounts.length} not active`}
              icon={Layers}
              tone="success"
            />
            <StatCard
              label="System vaults"
              value={systemAccounts.length}
              detail="Internal settlement accounts"
              icon={Building}
              tone="info"
            />
          </>
        )}
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by account number or UUID…"
              className="pl-9"
              aria-label="Search accounts"
            />
          </div>

          <div className="sm:w-48">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter accounts by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
              <option value="closed">Closed</option>
            </Select>
          </div>

          <div className="shrink-0 text-xs text-muted">
            {filteredAccounts.length} of {accounts.length} shown
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <AccountCardSkeleton />
          <AccountCardSkeleton />
          <AccountCardSkeleton />
          <AccountCardSkeleton />
          <AccountCardSkeleton />
          <AccountCardSkeleton />
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title={accounts.length === 0 ? 'No accounts yet' : 'No accounts match your filters'}
            description={
              accounts.length === 0
                ? 'Open your first customer account to start depositing, withdrawing, and transferring money.'
                : 'Try a different search term or status filter, or open a new customer account.'
            }
            action={
              <Button
                size="sm"
                onClick={() => {
                  generateSampleAccNumber();
                  setIsModalOpen(true);
                }}
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Open account
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.map((acc) => {
            const isSystem = acc.account_type === 'system';
            const typeLabel = isSystem
              ? (acc.system_role_type || 'system vault').toLowerCase().replace(/_/g, ' ')
              : 'customer ledger';
            const copied = copiedId === acc.id;

            return (
              <Card key={acc.id} className="flex flex-col">
                <CardBody className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isSystem ? 'bg-accent-soft text-accent' : 'bg-brand-soft text-brand'
                        }`}
                      >
                        {isSystem ? (
                          <Building className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Wallet className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-xs font-semibold tracking-wide text-ink">
                            {acc.account_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyAccountNumber(acc)}
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink"
                            aria-label={`Copy account number ${acc.account_number}`}
                            title="Copy account number"
                          >
                            {copied ? (
                              <Check className="h-3 w-3 text-success" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1">
                          <Badge variant={isSystem ? 'info' : 'neutral'} className="capitalize">
                            {typeLabel}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <AccountStatusBadge status={acc.status} />
                  </div>

                  <div className="mt-4">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Ledger balance
                    </div>
                    <div className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums">
                      {paiseToRupees(acc.current_balance)}
                    </div>
                  </div>

                  <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Currency</dt>
                      <dd className="font-mono font-medium text-ink-soft">{acc.currency || 'INR'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Created</dt>
                      <dd className="text-right font-medium text-ink-soft">{formatTimestamp(acc.created_at)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted">Account ID</dt>
                      <dd className="max-w-[55%] truncate font-mono text-[10px] text-slate-400" title={acc.id}>
                        {acc.id}
                      </dd>
                    </div>
                  </dl>
                </CardBody>

                <CardFooter className="justify-between gap-2">
                  <Link
                    to={`/accounts/${acc.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  >
                    Statement <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>

                  <ButtonLink
                    to={`/operations?type=transfer&source=${acc.id}`}
                    variant="secondary"
                    size="xs"
                    className="gap-1.5"
                  >
                    <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                    Transfer
                  </ButtonLink>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Open new customer account"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" form="create-account-form" size="sm" loading={submitting}>
              {submitting ? 'Creating…' : 'Create account'}
            </Button>
          </div>
        }
      >
        <form id="create-account-form" onSubmit={handleCreateAccount} className="space-y-4">
          <Field
            label="Account number"
            htmlFor="new-account-number"
            hint="Initial status will be active with a zero balance."
            required
          >
            <div className="flex gap-2">
              <Input
                id="new-account-number"
                type="text"
                value={newAccNumber}
                onChange={(event) => setNewAccNumber(event.target.value)}
                placeholder="e.g. ACC-IN-83920194"
                className="flex-1 font-mono"
                required
              />
              <Button type="button" variant="secondary" size="md" onClick={generateSampleAccNumber} className="shrink-0">
                Auto-generate
              </Button>
            </div>
          </Field>

          <Field label="Currency" htmlFor="new-account-currency" required>
            <Select
              id="new-account-currency"
              value={newCurrency}
              onChange={(event) => setNewCurrency(event.target.value)}
            >
              <option value="INR">INR · Indian Rupee (₹)</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
