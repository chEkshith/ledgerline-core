import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import {
  paiseToRupees,
  formatTimestamp,
  verifyLedgerPostings,
  bigIntAbs,
  transitionReversalState,
} from '../utils/formatters';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  ArrowLeftRight,
  AlertTriangle,
} from 'lucide-react';
import Alert from '../components/Alert';
import Modal from '../components/Modal';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  EntryTypeBadge,
  Field,
  PageHeader,
  PageLoading,
  Textarea,
  TransactionStatusBadge,
  useToast,
} from '../components/ui';

const verificationTone = {
  balanced: 'success',
  pending: 'warning',
  refused: 'danger',
};

function verificationDetails(status) {
  switch (status) {
    case 'balanced':
      return 'Debit and credit sum to zero and both match the transaction amount exactly.';
    case 'pending':
      return 'This transaction has not settled. Postings appear only after successful settlement.';
    case 'refused':
      return 'The financial engine recorded a business refusal. No ledger postings were created.';
    default:
      return 'The postings failed ledger integrity validation. Treat this transaction as unsettled.';
  }
}

function VerificationIcon({ status }) {
  if (status === 'balanced') return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (status === 'pending') return <Clock className="h-4 w-4" aria-hidden="true" />;
  if (status === 'refused') return <XCircle className="h-4 w-4" aria-hidden="true" />;
  return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
}

export default function TransactionDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState(null);
  const [reversing, setReversing] = useState(false);
  const [reversalOp, setReversalOp] = useState(() =>
    transitionReversalState(null, { type: 'INIT', txId: id })
  );

  useEffect(() => {
    setData(null);
    setReversalOp(transitionReversalState(null, { type: 'CHANGE_TX_ID', txId: id }));
    setReverseReason('');
    setReverseError(null);
  }, [id]);

  function handleReasonChange(newVal) {
    setReverseReason(newVal);
    setReverseError(null);
    setReversalOp((prev) => transitionReversalState(prev, { type: 'CHANGE_REASON', reason: newVal }));
  }

  const loadTransaction = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTransaction(id);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to fetch transaction details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTransaction();
  }, [loadTransaction]);

  async function handleReverse(e) {
    e.preventDefault();
    const trimmedReason = reverseReason.trim();
    if (!trimmedReason) {
      setReverseError('Please provide a legitimate reason for the administrative reversal');
      return;
    }

    setReversing(true);
    setReverseError(null);
    try {
      const res = await api.reverseTransaction(id, {
        reason: trimmedReason,
        idempotencyKey: reversalOp.idempotencyKey,
      });
      toast.success(`Reversal executed. Compensating transaction: ${res.transaction_id || res.id}`);
      setIsReverseModalOpen(false);
      setReverseReason('');
      setReversalOp(transitionReversalState(reversalOp, { type: 'SUCCESS' }));
      await loadTransaction();
    } catch (err) {
      setReversalOp((prev) =>
        transitionReversalState(prev, {
          type: 'SUBMIT_FAILURE',
          payload: { reason: trimmedReason },
        })
      );
      setReverseError(err.message || 'Reversal failed');
    } finally {
      setReversing(false);
    }
  }

  if (loading) {
    return <PageLoading label="Loading ledger postings…" />;
  }

  const tx = data?.transaction;
  const postings = data?.postings || [];
  const verification = verifyLedgerPostings(tx, postings);
  const tone = verificationTone[verification.status] || 'danger';

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Ledger verification"
        title="Transaction detail"
        description="Inspect the transaction record and prove its double-entry postings."
        backTo="/accounts"
        backLabel="Back to accounts"
        meta={
          <span className="truncate font-mono text-[10px] text-slate-400" title={id}>
            {id}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadTransaction}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
            {isAdmin && tx?.status === 'posted' && tx?.type !== 'reversal' && (
              <Button
                variant="outlineDanger"
                size="sm"
                onClick={() => {
                  setReverseError(null);
                  setIsReverseModalOpen(true);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Admin reversal
              </Button>
            )}
          </>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {!tx ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="Transaction not found"
            description="The transaction may not exist, or your account may not have access to it."
            action={
              <ButtonLink to="/accounts" variant="secondary" size="sm">
                Back to accounts
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="relative overflow-hidden">
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-brand/50 to-brass"
              aria-hidden="true"
            />
            <CardBody className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                    <span className="h-1 w-4 rounded-full bg-brass" aria-hidden="true" />
                    Transaction amount
                  </div>
                  <div className="mt-2 text-figure text-[2.5rem] leading-none text-ink sm:text-[3rem]">
                    {paiseToRupees(tx.amount_paise)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <TransactionStatusBadge status={tx.status} />
                    <Badge variant="neutral" className="capitalize">
                      {tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1) : '—'}
                    </Badge>
                    <Badge variant="neutral">{tx.currency || 'INR'}</Badge>
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-paper/70 p-3 text-xs">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Created</div>
                  <div className="mt-1 font-medium text-ink-soft">{formatTimestamp(tx.created_at)}</div>
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Last updated
                  </div>
                  <div className="mt-1 font-medium text-ink-soft">{formatTimestamp(tx.updated_at)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-paper/60 p-3">
                <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Source</div>
                    {tx.source_account_id ? (
                      <Link
                        to={`/accounts/${tx.source_account_id}`}
                        className="mt-1 inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                      >
                        <span className="truncate">{tx.source_account_id}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="mt-1 block text-muted">—</span>
                    )}
                  </div>

                  <ArrowLeftRight className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" aria-hidden="true" />

                  <div className="min-w-0 flex-1 sm:text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">Destination</div>
                    {tx.destination_account_id ? (
                      <Link
                        to={`/accounts/${tx.destination_account_id}`}
                        className="mt-1 inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-brand hover:underline sm:justify-end"
                      >
                        <span className="truncate">{tx.destination_account_id}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="mt-1 block text-muted">—</span>
                    )}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                  <dt className="text-muted">Created by</dt>
                  <dd className="min-w-0 truncate font-mono text-[10px] text-ink-soft" title={tx.created_by}>
                    {tx.created_by || '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                  <dt className="text-muted">Original transaction</dt>
                  <dd className="min-w-0 truncate font-mono text-[10px]">
                    {tx.original_transaction_id ? (
                      <Link to={`/transactions/${tx.original_transaction_id}`} className="text-brand hover:underline">
                        {tx.original_transaction_id}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </dd>
                </div>
              </dl>

              {tx.refusal_reason && (
                <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft/70 p-3.5 text-xs text-danger">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Engine refusal</p>
                    <p className="mt-0.5 font-mono text-[11px]">{tx.refusal_reason}</p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
                  Double-entry postings
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {postings.length} {postings.length === 1 ? 'posting' : 'postings'} recorded for this transaction.
                </p>
              </div>
              <Badge variant={tone}>{verification.label}</Badge>
            </CardHeader>

            <CardBody className="space-y-4">
              <div
                className={`flex items-start gap-3 rounded-lg border p-3 text-xs ${
                  tone === 'success'
                    ? 'border-success/20 bg-success-soft/70 text-success'
                    : tone === 'warning'
                      ? 'border-warning/20 bg-warning-soft/70 text-warning'
                      : 'border-danger/20 bg-danger-soft/70 text-danger'
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  <VerificationIcon status={verification.status} />
                </span>
                <div>
                  <p className="font-semibold">{verification.label}</p>
                  <p className="mt-0.5 leading-relaxed">{verificationDetails(verification.status)}</p>
                </div>
              </div>

              {postings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-paper/60 px-4 py-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-ink-soft">No ledger postings</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                    Zero postings are expected for refused or non-settled operations.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line bg-paper/80 text-[10px] font-semibold uppercase tracking-widest text-muted">
                        <tr>
                          <th className="px-4 py-3">Seq</th>
                          <th className="px-4 py-3">Account</th>
                          <th className="px-4 py-3">Entry</th>
                          <th className="px-4 py-3 text-right">Magnitude</th>
                          <th className="px-4 py-3 text-right">Signed amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {postings.map((posting) => {
                          const credit = String(posting.entry_type || '').toLowerCase() === 'credit';
                          return (
                            <tr key={posting.id} className="transition-colors hover:bg-paper/60">
                              <td className="px-4 py-3 font-mono text-muted">{posting.sequence_number}</td>
                              <td className="px-4 py-3">
                                <Link
                                  to={`/accounts/${posting.account_id}`}
                                  className="inline-flex max-w-[220px] items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                                  title={posting.account_id}
                                >
                                  <span className="truncate">{posting.account_id}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                                </Link>
                              </td>
                              <td className="px-4 py-3">
                                <EntryTypeBadge type={posting.entry_type} />
                              </td>
                              <td className="px-4 py-3 text-right text-ink-soft tabular-nums">
                                {paiseToRupees(posting.amount_paise)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-semibold tabular-nums ${
                                  credit ? 'text-success' : 'text-danger'
                                }`}
                              >
                                {credit ? '+' : '−'}
                                {paiseToRupees(bigIntAbs(posting.signed_amount_paise))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <ul className="divide-y divide-line md:hidden">
                    {postings.map((posting) => {
                      const credit = String(posting.entry_type || '').toLowerCase() === 'credit';
                      return (
                        <li key={posting.id} className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <EntryTypeBadge type={posting.entry_type} />
                                <span className="font-mono text-[10px] text-muted">#{posting.sequence_number}</span>
                              </div>
                              <Link
                                to={`/accounts/${posting.account_id}`}
                                className="mt-1.5 inline-flex max-w-full items-center gap-1 font-mono text-[10px] text-brand hover:underline"
                              >
                                <span className="truncate">{posting.account_id}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                              </Link>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-sm font-bold tabular-nums ${
                                  credit ? 'text-success' : 'text-danger'
                                }`}
                              >
                                {credit ? '+' : '−'}
                                {paiseToRupees(bigIntAbs(posting.signed_amount_paise))}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted tabular-nums">
                                {paiseToRupees(posting.amount_paise)}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </CardBody>

            <CardFooter>
              <p className="text-[11px] text-muted">
                Verification uses exact BigInt arithmetic. A posted transaction must have exactly one debit and
                one credit that sum to zero.
              </p>
            </CardFooter>
          </Card>
        </>
      )}

      <Modal
        isOpen={isReverseModalOpen}
        onClose={() => !reversing && setIsReverseModalOpen(false)}
        title="Execute administrative reversal"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsReverseModalOpen(false)}
              disabled={reversing}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="reverse-form"
              variant="danger"
              size="sm"
              loading={reversing}
              disabled={!reverseReason.trim()}
            >
              {reversing ? 'Executing…' : 'Execute reversal'}
            </Button>
          </div>
        }
      >
        <form id="reverse-form" onSubmit={handleReverse} className="space-y-4">
          {reverseError && <Alert type="error" message={reverseError} onClose={() => setReverseError(null)} />}

          <p className="text-xs leading-relaxed text-muted">
            A reversal creates a new compensating transaction with mirrored debit and credit postings, returning
            funds to their origin and referencing original transaction{' '}
            <code className="font-mono text-ink-soft">{id}</code>.
          </p>

          <div className="rounded-lg border border-line bg-paper/70 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Assigned idempotency key · preserved on retry
            </div>
            <div className="mt-1 break-all font-mono text-[10px] font-semibold text-brand">
              {reversalOp.idempotencyKey}
            </div>
          </div>

          <Field
            label="Auditable justification"
            htmlFor="reverse-reason"
            hint="Changing the reason after a failed attempt starts a new operation with a fresh key."
            required
          >
            <Textarea
              id="reverse-reason"
              rows={3}
              value={reverseReason}
              onChange={(event) => handleReasonChange(event.target.value)}
              disabled={reversing}
              placeholder="e.g. Disputed transaction investigation case #8392"
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
