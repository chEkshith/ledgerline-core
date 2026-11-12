import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import {
  ShieldCheck,
  UserX,
  UserCheck,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Lock,
  ScrollText,
  Fingerprint,
} from 'lucide-react';
import Alert from '../components/Alert';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Select,
  useToast,
} from '../components/ui';
import { transitionReversalState } from '../utils/formatters';

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();

  const [targetUserId, setTargetUserId] = useState('');
  const [targetStatus, setTargetStatus] = useState('false');
  const [statusReason, setStatusReason] = useState('');
  const [userStatusLoading, setUserStatusLoading] = useState(false);
  const [pendingUserStatus, setPendingUserStatus] = useState(null);

  const [reverseTxId, setReverseTxId] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);
  const [lastReversal, setLastReversal] = useState(null);
  const [reversalOp, setReversalOp] = useState(() =>
    transitionReversalState(null, { type: 'INIT', txId: '' })
  );

  const [error, setError] = useState(null);

  function handleUserStatus(e) {
    e.preventDefault();
    if (!targetUserId.trim() || !statusReason.trim()) {
      setError('Target user UUID and reason are required');
      return;
    }
    setError(null);
    setPendingUserStatus({
      userId: targetUserId.trim(),
      isActive: targetStatus === 'true',
      reason: statusReason.trim(),
    });
  }

  async function applyUserStatus() {
    if (!pendingUserStatus) return;
    setUserStatusLoading(true);
    setError(null);
    try {
      await api.setUserStatus(pendingUserStatus.userId, pendingUserStatus.isActive, pendingUserStatus.reason);
      toast.success(
        `User ${pendingUserStatus.isActive ? 'activated' : 'suspended'} and recorded in the audit log`
      );
      setTargetUserId('');
      setStatusReason('');
      setPendingUserStatus(null);
    } catch (err) {
      setError(err.message || 'Failed to update user status');
      setPendingUserStatus(null);
    } finally {
      setUserStatusLoading(false);
    }
  }

  function handleTxIdChange(value) {
    setReverseTxId(value);
    setReversalOp((prev) => transitionReversalState(prev, { type: 'CHANGE_TX_ID', txId: value.trim() }));
  }

  function handleReasonChange(value) {
    setReverseReason(value);
    setReversalOp((prev) => transitionReversalState(prev, { type: 'CHANGE_REASON', reason: value }));
  }

  async function handleReversal(e) {
    e.preventDefault();
    if (!reverseTxId.trim() || !reverseReason.trim()) {
      setError('Transaction ID and reason are required');
      return;
    }

    setReversalLoading(true);
    setError(null);
    setLastReversal(null);
    try {
      const res = await api.reverseTransaction(reverseTxId.trim(), {
        reason: reverseReason.trim(),
        idempotencyKey: reversalOp.idempotencyKey,
      });
      toast.success(`Reversal executed. Compensating transaction: ${res.transaction_id || res.id}`);
      setLastReversal(res);
      setReverseTxId('');
      setReverseReason('');
      setReversalOp(transitionReversalState(null, { type: 'INIT', txId: '' }));
    } catch (err) {
      setReversalOp((prev) =>
        transitionReversalState(prev, {
          type: 'SUBMIT_FAILURE',
          payload: { reason: reverseReason.trim() },
        })
      );
      setError(err.message || 'Reversal execution failed');
    } finally {
      setReversalLoading(false);
    }
  }

  const suspension = pendingUserStatus && !pendingUserStatus.isActive;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Restricted console"
        title="System governance"
        description="Authorized user lifecycle adjustments and compensating ledger reversals under a verified admin identity."
        actions={
          <Badge variant="warning" className="uppercase">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Admin only
          </Badge>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <UserX className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Modify user status</h2>
                <p className="mt-0.5 text-xs text-muted">Suspend or restore database authentication.</p>
              </div>
            </div>
          </CardHeader>

          <CardBody>
            <form onSubmit={handleUserStatus} className="space-y-4">
              <Field label="Target user UUID" htmlFor="admin-user-id" required>
                <Input
                  id="admin-user-id"
                  type="text"
                  value={targetUserId}
                  onChange={(event) => setTargetUserId(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="font-mono text-xs"
                  required
                />
              </Field>

              <Field label="Desired active status" htmlFor="admin-user-status" required>
                <Select
                  id="admin-user-status"
                  value={targetStatus}
                  onChange={(event) => setTargetStatus(event.target.value)}
                >
                  <option value="false">Suspend user · is_active = false</option>
                  <option value="true">Activate user · is_active = true</option>
                </Select>
              </Field>

              <Field label="Audit reason" htmlFor="admin-user-reason" hint="Attributed to your admin identity." required>
                <Input
                  id="admin-user-reason"
                  type="text"
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                  placeholder="e.g. Velocity alert triggered, compliance hold"
                  required
                />
              </Field>

              <Button
                type="submit"
                className="w-full"
                variant={targetStatus === 'true' ? 'success' : 'danger'}
                loading={userStatusLoading}
              >
                {targetStatus === 'true' ? (
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <UserX className="h-4 w-4" aria-hidden="true" />
                )}
                {targetStatus === 'true' ? 'Activate user' : 'Suspend user'}
              </Button>
            </form>
          </CardBody>

          <CardFooter>
            <p className="text-[11px] text-muted">
              Suspension blocks authentication immediately. Re-activation restores access without changing roles.
            </p>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Reverse transaction</h2>
                <p className="mt-0.5 text-xs text-muted">Generate compensating ledger postings.</p>
              </div>
            </div>
          </CardHeader>

          <CardBody>
            <form onSubmit={handleReversal} className="space-y-4">
              <Field label="Original transaction UUID" htmlFor="admin-tx-id" required>
                <Input
                  id="admin-tx-id"
                  type="text"
                  value={reverseTxId}
                  onChange={(event) => handleTxIdChange(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="font-mono text-xs"
                  required
                />
              </Field>

              <Field
                label="Reversal justification"
                htmlFor="admin-tx-reason"
                hint="Changing the reason after a failure starts a new operation with a fresh key."
                required
              >
                <Input
                  id="admin-tx-reason"
                  type="text"
                  value={reverseReason}
                  onChange={(event) => handleReasonChange(event.target.value)}
                  placeholder="e.g. Erroneous payment, disputed transaction"
                  required
                />
              </Field>

              <div className="rounded-lg border border-line bg-paper/70 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Assigned idempotency key · preserved on retry
                </div>
                <div className="mt-1 break-all font-mono text-[10px] font-semibold text-brand">
                  {reversalOp.idempotencyKey}
                </div>
              </div>

              <Button type="submit" className="w-full" variant="danger" loading={reversalLoading}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {reversalLoading ? 'Executing reversal…' : 'Execute ledger reversal'}
              </Button>
            </form>
          </CardBody>

          <CardFooter>
            <p className="text-[11px] text-muted">
              Reversals reference the original transaction and cannot themselves be reversed.
            </p>
          </CardFooter>
        </Card>
      </div>

      {lastReversal && (
        <Card className="border-success/30">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink">Reversal settled</h2>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  {lastReversal.transaction_id || lastReversal.id}
                </p>
              </div>
            </div>
            <Link
              to={`/transactions/${lastReversal.transaction_id || lastReversal.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              View compensating postings <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-ink">Administrative safeguards</h2>
            <p className="mt-0.5 text-xs text-muted">Controls enforced by the database and API layer.</p>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="grid grid-cols-1 gap-3 text-xs text-muted sm:grid-cols-3">
            <li className="flex items-start gap-2 rounded-lg border border-line p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-ink-soft">Role enforced</span>
                <span className="mt-0.5 block">Admin routes require a verified admin role.</span>
              </span>
            </li>
            <li className="flex items-start gap-2 rounded-lg border border-line p-3">
              <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-ink-soft">Idempotent reversal</span>
                <span className="mt-0.5 block">Retries reuse the key; changed intent rotates it.</span>
              </span>
            </li>
            <li className="flex items-start gap-2 rounded-lg border border-line p-3">
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-ink-soft">Audit attributed</span>
                <span className="mt-0.5 block">Actions are attributed to your admin identity.</span>
              </span>
            </li>
          </ul>
        </CardBody>
        <CardFooter>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Signed in as <span className="font-mono text-ink-soft">{user?.email}</span>
          </p>
        </CardFooter>
      </Card>

      <ConfirmDialog
        isOpen={!!pendingUserStatus}
        onClose={() => !userStatusLoading && setPendingUserStatus(null)}
        onConfirm={applyUserStatus}
        title={suspension ? 'Suspend user?' : 'Activate user?'}
        description={
          pendingUserStatus
            ? `You are about to ${suspension ? 'suspend' : 'activate'} user ${pendingUserStatus.userId}. Reason: “${
                pendingUserStatus.reason
              }”. This takes effect immediately and is recorded in the audit log.`
            : ''
        }
        confirmLabel={suspension ? 'Suspend user' : 'Activate user'}
        tone={suspension ? 'danger' : 'success'}
        loading={userStatusLoading}
      />
    </div>
  );
}
