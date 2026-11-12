import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import {
  rupeesToPaise,
  paiseToRupees,
  generateIdempotencyKey,
  formatTimestamp,
  canTransactOnAccount,
} from '../utils/formatters';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Copy,
  Info,
  RotateCcw,
  Repeat,
  Building,
  Wallet,
} from 'lucide-react';
import Alert from '../components/Alert';
import Modal from '../components/Modal';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  InputPrefix,
  PageHeader,
  Select,
  useToast,
} from '../components/ui';

const operationMeta = {
  deposit: {
    label: 'Deposit',
    description: 'Vault → account',
    icon: ArrowDownLeft,
    tone: 'success',
    activeClass: 'border-success/30 bg-success-soft/50 ring-1 ring-success/15',
    iconClass: 'bg-success-soft text-success',
  },
  withdraw: {
    label: 'Withdraw',
    description: 'Account → vault',
    icon: ArrowUpRight,
    tone: 'warning',
    activeClass: 'border-warning/30 bg-warning-soft/50 ring-1 ring-warning/15',
    iconClass: 'bg-warning-soft text-warning',
  },
  transfer: {
    label: 'Transfer',
    description: 'Account → account',
    icon: ArrowLeftRight,
    tone: 'info',
    activeClass: 'border-accent/30 bg-accent-soft/50 ring-1 ring-accent/15',
    iconClass: 'bg-accent-soft text-accent',
  },
};

function apiTypeFor(operationType) {
  return operationType === 'withdraw' ? 'withdrawal' : operationType;
}

function labelForType(type) {
  if (type === 'withdrawal') return 'Withdrawal';
  if (!type) return 'Transaction';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function Operations() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [operationType, setOperationType] = useState(searchParams.get('type') || 'transfer');
  const [accounts, setAccounts] = useState([]);
  const [sourceAccountId, setSourceAccountId] = useState(searchParams.get('source') || '');
  const [destinationAccountId, setDestinationAccountId] = useState(
    searchParams.get('destination') || ''
  );
  const [amountRupees, setAmountRupees] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [lastAttempt, setLastAttempt] = useState(null);
  const [review, setReview] = useState(null);
  const [modalError, setModalError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [lastSettledTx, setLastSettledTx] = useState(null);
  const [replaying, setReplaying] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const list = await api.listAccounts();
      setAccounts(list || []);
    } catch {
      setError('Failed to load accounts for money movement setup');
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!accounts.length) return;
    const vault = accounts.find((account) => account.system_role_type === 'SYSTEM_CASH_VAULT');
    const firstOperable = accounts.find(
      (account) => account.account_type === 'customer' && canTransactOnAccount(user, account)
    );

    if (operationType === 'deposit') {
      if (vault) setSourceAccountId(vault.id);
      setDestinationAccountId((current) => current || firstOperable?.id || '');
    } else if (operationType === 'withdraw') {
      setSourceAccountId((current) => current || firstOperable?.id || '');
      if (vault) setDestinationAccountId(vault.id);
    } else if (operationType === 'transfer') {
      setSourceAccountId((current) => current || firstOperable?.id || '');
    }
  }, [accounts, operationType, user]);

  function handleTypeChange(type) {
    setOperationType(type);
    setResult(null);
    setError(null);
    setReview(null);
    setModalError(null);
    setSearchParams({ type });

    const vault = accounts.find((account) => account.system_role_type === 'SYSTEM_CASH_VAULT');
    const firstOperable = accounts.find(
      (account) => account.account_type === 'customer' && canTransactOnAccount(user, account)
    );

    if (type === 'deposit') {
      if (vault) setSourceAccountId(vault.id);
      setDestinationAccountId(firstOperable?.id || '');
    } else if (type === 'withdraw') {
      setSourceAccountId(firstOperable?.id || '');
      setDestinationAccountId(vault?.id || '');
    } else if (type === 'transfer') {
      setSourceAccountId(firstOperable?.id || '');
      setDestinationAccountId('');
    }
  }

  function accountLabel(accountId) {
    if (!accountId) return '—';
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return accountId;
    if (account.system_role_type === 'SYSTEM_CASH_VAULT') {
      return `${account.account_number} · System cash vault`;
    }
    return `${account.account_number} · ${account.account_type} · ${paiseToRupees(account.current_balance)}`;
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setModalError(null);

    let paiseAmount;
    try {
      paiseAmount = rupeesToPaise(amountRupees);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    if (!sourceAccountId || !destinationAccountId) {
      setError('Both source and destination accounts must be selected');
      return;
    }

    if (sourceAccountId === destinationAccountId) {
      setError('Source and destination accounts must be different');
      return;
    }

    const payload = {
      type: apiTypeFor(operationType),
      amountPaise: paiseAmount,
      sourceAccountId,
      destinationAccountId,
    };
    const signature = JSON.stringify(payload);

    let keyToUse = idempotencyKey;
    if (lastAttempt && lastAttempt.signature !== signature) {
      keyToUse = generateIdempotencyKey();
      setIdempotencyKey(keyToUse);
    }

    setReview({ payload, signature, key: keyToUse });
  }

  async function handleConfirm() {
    if (!review) return;
    setSubmitting(true);
    setModalError(null);
    setError(null);

    try {
      const res = await api.executeTransaction({
        ...review.payload,
        idempotencyKey: review.key,
      });

      setLastSettledTx({
        key: review.key,
        payload: review.payload,
        result: res,
      });
      setLastAttempt(null);
      setResult(res);
      setIdempotencyKey(generateIdempotencyKey());
      setReview(null);
      toast.success(`Transaction ${res.transaction_id} settled and posted`);
      loadAccounts();
    } catch (err) {
      setLastAttempt({ signature: review.signature, key: review.key });
      setModalError(err.message || 'Transaction failed or was refused by the engine');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSimulateRealReplay() {
    if (!lastSettledTx) return;
    setError(null);
    setReplaying(true);
    try {
      const replayRes = await api.executeTransaction({
        ...lastSettledTx.payload,
        idempotencyKey: lastSettledTx.key,
      });
      setResult(replayRes);
    } catch (err) {
      setError(`Replay test failed: ${err.message}`);
    } finally {
      setReplaying(false);
    }
  }

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(idempotencyKey);
      toast.success('Idempotency key copied');
    } catch {
      toast.error('Could not copy idempotency key');
    }
  }

  function handleNewKey() {
    setIdempotencyKey(generateIdempotencyKey());
    setLastAttempt(null);
    setResult(null);
    setError(null);
    setModalError(null);
  }

  const customerAccounts = accounts.filter((account) => account.account_type === 'customer');
  const operableCustomerAccounts = customerAccounts.filter((account) =>
    canTransactOnAccount(user, account)
  );
  const hasOnlyReadOnlyAuditorAccounts =
    !isAdmin && customerAccounts.length > 0 && operableCustomerAccounts.length === 0;
  const vaultAccount = accounts.find((account) => account.system_role_type === 'SYSTEM_CASH_VAULT');
  const meta = operationMeta[operationType] || operationMeta.transfer;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Money movement"
        title="Move money"
        description="Execute deposits, withdrawals, and transfers with idempotent, double-entry settlement."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadAccounts}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh balances
            </Button>
            <ButtonLink to="/accounts" variant="secondary" size="sm">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Accounts
            </ButtonLink>
          </>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {hasOnlyReadOnlyAuditorAccounts && (
        <Alert
          type="warning"
          message="Your accessible customer accounts grant read-only auditor access. You can inspect account statements, while deposits, withdrawals, and transfers require account_holder or admin privileges."
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Object.entries(operationMeta).map(([type, item]) => {
          const Icon = item.icon;
          const selected = operationType === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              onClick={() => handleTypeChange(type)}
              className={`relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                selected
                  ? item.activeClass
                  : 'border-line bg-surface hover:border-line-strong hover:shadow-sm'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  selected ? item.iconClass : 'bg-paper text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{item.label}</span>
                <span className="block truncate text-[11px] text-muted">{item.description}</span>
              </span>
              {selected && (
                <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brass" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-ink">{meta.label} details</h2>
              <p className="mt-0.5 text-xs text-muted">
                Amounts settle in integer paise with a balanced debit and credit.
              </p>
            </div>
            <Badge variant={meta.tone} className="uppercase">
              {meta.label}
            </Badge>
          </CardHeader>

          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Source · debit account" htmlFor="source-account" required>
                {operationType === 'deposit' ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper/70 px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Building className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <span className="truncate font-medium text-ink">System cash vault</span>
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted">
                      {vaultAccount?.account_number || 'unavailable'}
                    </span>
                  </div>
                ) : (
                  <Select
                    id="source-account"
                    value={sourceAccountId}
                    onChange={(event) => setSourceAccountId(event.target.value)}
                  >
                    <option value="">Select source account…</option>
                    {operableCustomerAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_number} · {paiseToRupees(account.current_balance)} · {account.status}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Destination · credit account" htmlFor="destination-account" required>
                {operationType === 'withdraw' ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper/70 px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Building className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <span className="truncate font-medium text-ink">System cash vault</span>
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted">
                      {vaultAccount?.account_number || 'unavailable'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Select
                      id="destination-account"
                      value={destinationAccountId}
                      onChange={(event) => setDestinationAccountId(event.target.value)}
                    >
                      <option value="">Select destination account…</option>
                      {(operationType === 'deposit' ? operableCustomerAccounts : customerAccounts)
                        .filter((account) => account.id !== sourceAccountId)
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_number} · {paiseToRupees(account.current_balance)}
                          </option>
                        ))}
                    </Select>
                    {operationType === 'transfer' && (
                      <Input
                        type="text"
                        value={destinationAccountId}
                        onChange={(event) => setDestinationAccountId(event.target.value)}
                        placeholder="Or enter recipient account UUID directly…"
                        className="font-mono text-xs"
                        aria-label="Recipient account UUID"
                      />
                    )}
                  </div>
                )}
              </Field>

              <Field
                label="Amount"
                htmlFor="operation-amount"
                hint="Settles internally in integer minor currency (paise). No floating-point rounding."
                required
              >
                <InputPrefix prefix="₹">
                  <Input
                    id="operation-amount"
                    type="text"
                    inputMode="decimal"
                    value={amountRupees}
                    onChange={(event) => setAmountRupees(event.target.value)}
                    placeholder="100.00"
                    className="h-11 font-mono text-base font-semibold"
                    required
                  />
                </InputPrefix>
              </Field>

              {operationType !== 'transfer' && !vaultAccount && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-warning-soft/60 p-3 text-xs text-amber-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>System cash vault is unavailable for this session, so this operation cannot settle.</p>
                </div>
              )}

              <div className="rounded-lg border border-line bg-paper/70 p-3">
                <div className="flex items-start gap-2 text-xs text-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <p className="leading-relaxed">
                    Review the operation before settlement. A successful request posts a balanced debit and
                    credit and rotates the idempotency key.
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || replaying || hasOnlyReadOnlyAuditorAccounts}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Review {meta.label.toLowerCase()}
              </Button>
            </form>
          </CardBody>
        </Card>

        <section className="relative flex flex-col overflow-hidden rounded-2xl bg-ink-deep text-[#f8f5ed] shadow-ledger animate-rise">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(520px circle at 90% 0%, rgba(168,121,43,0.18), transparent 58%), radial-gradient(420px circle at 0% 100%, rgba(22,121,79,0.22), transparent 58%)',
            }}
            aria-hidden="true"
          />
          <div className="ledger-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />

          <div className="relative flex flex-1 flex-col gap-4 p-5 sm:p-6">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#fffdf8]">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Idempotency
              </h2>
              <p className="mt-0.5 text-xs text-[#f8f5ed]/50">Safe retries without duplicate debits.</p>
            </div>

            <p className="text-xs leading-relaxed text-[#f8f5ed]/55">
              Every financial mutation requires a unique client-generated UUID key. Repeating a request with
              the same key returns the exact cached response without double debit.
            </p>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#f8f5ed]/40">
                  Active request key
                </span>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200 transition-colors hover:text-emerald-100"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  Copy
                </button>
              </div>
              <div className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-[#f8f5ed]/80">
                {idempotencyKey}
              </div>
            </div>

            <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={handleNewKey}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-[#f8f5ed] transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Generate fresh key
              </button>

              {lastSettledTx && (
                <button
                  type="button"
                  onClick={handleSimulateRealReplay}
                  disabled={replaying || submitting}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Repeat
                    className={`h-3.5 w-3.5 ${replaying ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {replaying ? 'Sending replay…' : 'Send live replay (same key)'}
                </button>
              )}

              <p className="text-center text-[10px] leading-relaxed text-[#f8f5ed]/35">
                Replays transmit genuine duplicate HTTP requests to test server idempotency resolution.
              </p>
            </div>
          </div>
        </section>
      </div>

      {result && (
        <Card className="relative overflow-hidden border-success/30 animate-rise">
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-success via-brand to-brass"
            aria-hidden="true"
          />
          <CardBody className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink">
                    {result.status === 'success' ? 'Transaction settled and posted' : 'Transaction processed'}
                  </h2>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                    {result.transaction_id || result.id}
                  </p>
                </div>
              </div>

              {result.isIdempotentReplay && (
                <Badge variant="warning" className="uppercase">
                  Idempotent replay confirmed
                </Badge>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="mt-1 font-semibold capitalize text-ink">{result.status}</dd>
              </div>
              <div>
                <dt className="text-muted">Amount</dt>
                <dd className="mt-1 font-semibold text-success tabular-nums">
                  {paiseToRupees(result.amount_paise)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Type</dt>
                <dd className="mt-1 font-semibold text-ink">{labelForType(result.type)}</dd>
              </div>
              <div>
                <dt className="text-muted">Posted at</dt>
                <dd className="mt-1 font-semibold text-ink">{formatTimestamp(result.posted_at)}</dd>
              </div>
            </dl>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setAmountRupees('');
                }}
              >
                Start another
              </Button>
              <ButtonLink to={`/transactions/${result.transaction_id || result.id}`} size="sm">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                View ledger postings
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        isOpen={!!review}
        onClose={() => {
          if (!submitting) {
            setReview(null);
            setModalError(null);
          }
        }}
        title={review ? `Review ${meta.label.toLowerCase()}` : 'Review operation'}
        size="md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setReview(null);
                setModalError(null);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleConfirm} loading={submitting}>
              {submitting ? 'Settling…' : modalError ? 'Retry with same key' : 'Confirm & settle'}
            </Button>
          </div>
        }
      >
        {review && (
          <div className="space-y-4">
            {modalError && <Alert type="error" message={modalError} />}

            <dl className="divide-y divide-line rounded-lg border border-line">
              <div className="flex items-center justify-between gap-4 px-3 py-2.5 text-xs">
                <dt className="text-muted">Operation</dt>
                <dd className="font-semibold text-ink">{labelForType(review.payload.type)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-2.5 text-xs">
                <dt className="text-muted">Amount</dt>
                <dd className="font-semibold text-ink tabular-nums">
                  {paiseToRupees(review.payload.amountPaise)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-3 py-2.5 text-xs">
                <dt className="shrink-0 text-muted">From</dt>
                <dd className="min-w-0 break-all text-right font-mono text-[10px] text-ink-soft">
                  {accountLabel(review.payload.sourceAccountId)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-3 py-2.5 text-xs">
                <dt className="shrink-0 text-muted">To</dt>
                <dd className="min-w-0 break-all text-right font-mono text-[10px] text-ink-soft">
                  {accountLabel(review.payload.destinationAccountId)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-3 py-2.5 text-xs">
                <dt className="shrink-0 text-muted">Idempotency key</dt>
                <dd className="min-w-0 break-all text-right font-mono text-[10px] text-muted">{review.key}</dd>
              </div>
            </dl>

            <div className="flex items-start gap-2 rounded-lg border border-line bg-paper/70 p-3 text-xs text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <p className="leading-relaxed">
                Confirming sends a single idempotent request. If the response is lost, retrying with the same
                key returns the original result without a second debit.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
