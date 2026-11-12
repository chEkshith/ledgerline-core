import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import {
  paiseToRupees,
  formatTimestamp,
  canManageAccountMemberships,
  isAccountReadOnly,
  canTransactOnAccount,
} from '../utils/formatters';
import {
  Wallet,
  FileText,
  Users,
  Settings,
  UserPlus,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  Search,
  ShieldCheck,
  Trash2,
  Eye,
} from 'lucide-react';
import Alert from '../components/Alert';
import {
  AccountStatusBadge,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoading,
  Pagination,
  Select,
  TableSkeleton,
  useToast,
} from '../components/ui';

function isCreditEntry(entry) {
  return String(entry.entry_type || '').toLowerCase() === 'credit';
}

export default function AccountDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  const canManageMembers = canManageAccountMemberships(user);

  const [activeTab, setActiveTab] = useState(() =>
    canManageMembers && searchParams.get('tab') === 'memberships' ? 'memberships' : 'statement'
  );
  const [account, setAccount] = useState(null);
  const [statement, setStatement] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 15, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statementSearch, setStatementSearch] = useState('');
  const [statementType, setStatementType] = useState('all');

  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [memberships, setMemberships] = useState([]);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('auditor');
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState(null);
  const [pendingRevokeMember, setPendingRevokeMember] = useState(null);
  const [revokingMember, setRevokingMember] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAccountStatement(id, {
        limit: pagination.limit,
        offset: pagination.offset,
      });
      setAccount(data.account);
      setStatement(data.statement || []);
      setPagination(data.pagination);
      setNewStatus(data.account.status);
    } catch (err) {
      setError(err.message || 'Failed to load account details');
    } finally {
      setLoading(false);
    }
  }, [id, pagination.limit, pagination.offset]);

  const loadMembershipData = useCallback(async () => {
    if (!canManageMembers) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const [memRes, usersList] = await Promise.all([
        api.listAccountMemberships(id),
        api.listUsers(),
      ]);
      setMemberships(memRes?.memberships || []);
      setRegisteredUsers(usersList || []);
    } catch (err) {
      setMembersError(err.message || 'Failed to load account memberships');
    } finally {
      setMembersLoading(false);
    }
  }, [id, canManageMembers]);

  useEffect(() => {
    setAccount(null);
    setStatement([]);
    setMemberships([]);
    setMembersError(null);
    setPagination((current) => ({ ...current, total: 0, offset: 0 }));
  }, [id]);

  useEffect(() => {
    if (canManageMembers && searchParams.get('tab') === 'memberships') {
      setActiveTab('memberships');
    }
  }, [canManageMembers, searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (canManageMembers && activeTab === 'memberships') {
      loadMembershipData();
    }
  }, [canManageMembers, activeTab, loadMembershipData]);

  async function handleStatusChange(e) {
    e.preventDefault();
    if (!statusReason.trim()) {
      setError('A reason is required to modify account status');
      return;
    }

    setStatusSubmitting(true);
    setError(null);
    try {
      await api.updateAccountStatus(id, newStatus, statusReason.trim());
      toast.success(`Account status updated to ${newStatus}`);
      setStatusReason('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to update account status');
    } finally {
      setStatusSubmitting(false);
    }
  }

  async function handleAssignMember(e) {
    e.preventDefault();
    if (!memberUserId.trim()) {
      setMembersError('Please select a registered user');
      return;
    }

    setMemberSubmitting(true);
    setMembersError(null);
    try {
      await api.assignMembership(id, memberUserId.trim(), memberRole);
      toast.success('Membership assigned successfully');
      setMemberUserId('');
      await loadMembershipData();
    } catch (err) {
      setMembersError(err.message || 'Failed to assign membership');
    } finally {
      setMemberSubmitting(false);
    }
  }

  async function handleRoleChange(member, nextRole) {
    if (!member || member.role === nextRole) return;
    setUpdatingMemberId(member.user_id);
    setMembersError(null);
    try {
      await api.assignMembership(id, member.user_id, nextRole);
      toast.success(`Updated ${member.email} role to ${nextRole}`);
      await loadMembershipData();
    } catch (err) {
      setMembersError(err.message || 'Failed to update membership role');
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function handleConfirmRevoke() {
    if (!pendingRevokeMember) return;
    setRevokingMember(true);
    setMembersError(null);
    try {
      await api.revokeMembership(id, pendingRevokeMember.user_id);
      toast.success(`Removed ${pendingRevokeMember.email} from this account`);
      setPendingRevokeMember(null);
      await loadMembershipData();
    } catch (err) {
      setMembersError(err.message || 'Failed to remove member');
      setPendingRevokeMember(null);
    } finally {
      setRevokingMember(false);
    }
  }

  const isReadOnlyAuditor = isAccountReadOnly(user, account);
  const canTransact = canTransactOnAccount(user, account);
  const canModifyStatus = Boolean(
    account && (isAdmin || account.membership_role === 'account_holder')
  );

  const visibleTabs = [
    { id: 'statement', label: 'Statement', icon: FileText },
    ...(canModifyStatus ? [{ id: 'settings', label: 'Settings & status', icon: Settings }] : []),
    ...(canManageMembers ? [{ id: 'memberships', label: 'Memberships', icon: Users }] : []),
  ];

  const effectiveTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : 'statement';
  const accountHolderCount = memberships.filter((m) => m.role === 'account_holder').length;

  const filteredStatement = statement.filter((entry) => {
    const query = statementSearch.trim().toLowerCase();
    const matchesQuery =
      !query ||
      entry.transaction_id?.toLowerCase().includes(query) ||
      entry.transaction_type?.toLowerCase().includes(query);
    const entryType = String(entry.entry_type || '').toLowerCase();
    const matchesType = statementType === 'all' || entryType === statementType;
    return matchesQuery && matchesType;
  });

  if (loading && !account) {
    return <PageLoading label="Loading account details…" />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Account detail"
        title={account?.account_number || 'Account'}
        description="Ledger postings, operational status, and role-based access for this account."
        backTo="/accounts"
        backLabel="Back to accounts"
        meta={
          <span className="truncate font-mono text-[10px] text-slate-400" title={id}>
            {id}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
            {canTransact && account?.account_type !== 'system' && (
              <ButtonLink to={`/operations?type=deposit&destination=${id}`} size="sm">
                <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Deposit
              </ButtonLink>
            )}
          </>
        }
      />

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {account && (
        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-ledger animate-rise">
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-brand/50 to-brass"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70"
            style={{
              background:
                'radial-gradient(460px circle at 4% 0%, rgba(14,91,74,0.08), transparent 68%), radial-gradient(420px circle at 96% 0%, rgba(168,121,43,0.10), transparent 66%)',
            }}
            aria-hidden="true"
          />
          <div className="relative grid gap-6 p-6 sm:p-7 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-sm font-semibold tracking-wide text-ink">
                  {account.account_number}
                </span>
                <AccountStatusBadge status={account.status} />
                <Badge variant={account.account_type === 'system' ? 'info' : 'neutral'} className="capitalize">
                  {account.account_type === 'system'
                    ? (account.system_role_type || 'system vault').toLowerCase().replace(/_/g, ' ')
                    : 'customer ledger'}
                </Badge>
                {account.account_type !== 'system' && isReadOnlyAuditor && (
                  <Badge variant="warning">Auditor · Read-only</Badge>
                )}
                {account.account_type !== 'system' && !isReadOnlyAuditor && account.membership_role === 'account_holder' && (
                  <Badge variant="success">Account holder</Badge>
                )}
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                  <span className="h-1 w-4 rounded-full bg-brass" aria-hidden="true" />
                  Current ledger balance
                </div>
                <div className="mt-2 text-figure text-[2.4rem] leading-none text-ink sm:text-[3rem]">
                  {paiseToRupees(account.current_balance)}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Derived from {formatTimestamp(account.created_at)} · all postings reconciled
                </p>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2 text-xs sm:grid-cols-3">
                <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                  <dt className="text-muted">Currency</dt>
                  <dd className="font-mono font-medium text-ink-soft">{account.currency || 'INR'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                  <dt className="text-muted">Account type</dt>
                  <dd className="font-medium capitalize text-ink-soft">{account.account_type}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                  <dt className="text-muted">Opened</dt>
                  <dd className="text-right font-medium text-ink-soft">{formatTimestamp(account.created_at)}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-line bg-paper/70 p-4">
              {isReadOnlyAuditor ? (
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-warning">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Read-only auditor access
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                    Your membership grants inspection access to account balances, statement postings, and
                    transaction proof records.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Deposits, withdrawals, transfers, and account configuration changes are disabled and
                    rejected by backend and database security policies.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Ledger actions
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <ButtonLink to={`/operations?type=deposit&destination=${id}`} variant="success" size="sm">
                      <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Deposit into this account
                    </ButtonLink>
                    <ButtonLink to={`/operations?type=withdraw&source=${id}`} variant="secondary" size="sm">
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      Withdraw from this account
                    </ButtonLink>
                    <ButtonLink to={`/operations?type=transfer&source=${id}`} variant="secondary" size="sm">
                      <ArrowUpRight className="h-3.5 w-3.5 rotate-45" aria-hidden="true" />
                      Transfer to another ledger
                    </ButtonLink>
                  </div>
                </div>
              )}
              <p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
                Every movement posts a balanced debit and credit. Balances never change in isolation.
              </p>
            </div>
          </div>
        </section>
      )}

      <div
        className="flex gap-1 overflow-x-auto rounded-t-xl border-b border-line bg-paper/50 px-2"
        role="tablist"
        aria-label="Account sections"
      >
        {visibleTabs.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={effectiveTab === tabId}
            onClick={() => {
              setActiveTab(tabId);
              setSearchParams(tabId === 'memberships' ? { tab: 'memberships' } : {}, { replace: true });
            }}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors ${
              effectiveTab === tabId
                ? 'border-brass text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon
              className={`h-4 w-4 ${effectiveTab === tabId ? 'text-brand' : 'text-slate-400'}`}
              aria-hidden="true"
            />
            {label}
          </button>
        ))}
      </div>

      {effectiveTab === 'statement' && (
        <Card className="overflow-hidden">
          <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-ink">Ledger statement</h2>
              <p className="mt-0.5 text-xs text-muted">
                Chronological postings · {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative sm:w-56">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  value={statementSearch}
                  onChange={(event) => setStatementSearch(event.target.value)}
                  placeholder="Transaction ID or type…"
                  className="pl-9"
                  aria-label="Filter statement entries"
                />
              </div>
              <div className="sm:w-36">
                <Select
                  value={statementType}
                  onChange={(event) => setStatementType(event.target.value)}
                  aria-label="Filter statement by entry type"
                >
                  <option value="all">All entries</option>
                  <option value="credit">Credits</option>
                  <option value="debit">Debits</option>
                </Select>
              </div>
            </div>
          </CardHeader>

          {loading ? (
            <TableSkeleton rows={6} />
          ) : statement.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No postings yet"
              description="This ledger has no recorded postings. Deposits, withdrawals, and transfers will appear here."
              action={
                canTransact && account?.account_type !== 'system' ? (
                  <ButtonLink to={`/operations?type=deposit&destination=${id}`} size="sm">
                    <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                    Make a deposit
                  </ButtonLink>
                ) : null
              }
            />
          ) : filteredStatement.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching entries on this page"
              description="Try a different transaction ID, transaction type, or entry type. Filters apply to the current page."
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-paper/80 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    <tr>
                      <th className="px-5 py-3">Seq</th>
                      <th className="px-5 py-3">Timestamp</th>
                      <th className="px-5 py-3">Entry</th>
                      <th className="px-5 py-3">Transaction</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                      <th className="px-5 py-3 text-right">Running balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredStatement.map((entry) => {
                      const credit = isCreditEntry(entry);
                      return (
                        <tr key={entry.id} className="transition-colors hover:bg-paper/60">
                          <td className="px-5 py-3 font-mono text-muted">{entry.sequence_number}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted">
                            {formatTimestamp(entry.created_at)}
                          </td>
                          <td className="px-5 py-3">
                            <Badge variant={credit ? 'success' : 'danger'} className="uppercase">
                              {entry.entry_type}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <Link
                              to={`/transactions/${entry.transaction_id}`}
                              className="inline-flex max-w-[180px] items-center gap-1 font-mono text-brand hover:underline"
                              title={entry.transaction_id}
                            >
                              <span className="truncate">{entry.transaction_id}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                            </Link>
                          </td>
                          <td
                            className={`px-5 py-3 text-right font-semibold tabular-nums ${
                              credit ? 'text-success' : 'text-danger'
                            }`}
                          >
                            {credit ? '+' : '−'}
                            {paiseToRupees(entry.amount_paise)}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-ink tabular-nums">
                            {paiseToRupees(entry.running_balance_paise)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line md:hidden">
                {filteredStatement.map((entry) => {
                  const credit = isCreditEntry(entry);
                  return (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              credit ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                            }`}
                          >
                            {credit ? (
                              <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant={credit ? 'success' : 'danger'} className="uppercase">
                                {entry.entry_type}
                              </Badge>
                              <span className="text-[10px] font-mono text-muted">#{entry.sequence_number}</span>
                            </div>
                            <div className="mt-1 text-[11px] capitalize text-ink-soft">
                              {entry.transaction_type || 'transaction'}
                            </div>
                            <div className="text-[10px] text-slate-400">{formatTimestamp(entry.created_at)}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold tabular-nums ${
                              credit ? 'text-success' : 'text-danger'
                            }`}
                          >
                            {credit ? '+' : '−'}
                            {paiseToRupees(entry.amount_paise)}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted tabular-nums">
                            Bal {paiseToRupees(entry.running_balance_paise)}
                          </div>
                        </div>
                      </div>
                      <Link
                        to={`/transactions/${entry.transaction_id}`}
                        className="mt-2 inline-flex max-w-full items-center gap-1 font-mono text-[10px] text-brand hover:underline"
                      >
                        <span className="truncate">{entry.transaction_id}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <Pagination
            total={pagination.total}
            limit={pagination.limit}
            offset={pagination.offset}
            onChange={(offset) => setPagination((current) => ({ ...current, offset }))}
            label="postings"
          />
        </Card>
      )}

      {effectiveTab === 'settings' && canModifyStatus && (
        <Card className="max-w-2xl">
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-ink">Account operational status</h2>
              <p className="mt-0.5 text-xs text-muted">
                Frozen accounts reject debits and credits immediately at the financial engine level.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-warning-soft/60 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="leading-relaxed">
                Status changes are audit tracked and require a reason. Closing an account is terminal and cannot
                be reversed.
              </p>
            </div>

            <form onSubmit={handleStatusChange} className="space-y-4">
              <Field label="Target status" htmlFor="account-status" required>
                <Select
                  id="account-status"
                  value={newStatus}
                  onChange={(event) => setNewStatus(event.target.value)}
                >
                  <option value="active">Active · normal operations</option>
                  <option value="frozen">Frozen · lock all movements</option>
                  <option value="closed">Closed · terminal state</option>
                </Select>
              </Field>

              <Field
                label="Reason for change"
                htmlFor="account-status-reason"
                hint="Recorded in the audit trail."
                required
              >
                <Input
                  id="account-status-reason"
                  type="text"
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                  placeholder="e.g. Risk compliance hold, customer request"
                  required
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" loading={statusSubmitting}>
                  {statusSubmitting ? 'Updating…' : 'Save account status'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {effectiveTab === 'memberships' && canManageMembers && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-semibold text-ink">Account members &amp; roles</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Admin-only membership management. Account holders can transact; auditors have read-only statement access.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadMembershipData}
                disabled={membersLoading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${membersLoading ? 'animate-spin text-brand' : ''}`}
                  aria-hidden="true"
                />
                Refresh members
              </Button>
            </CardHeader>

            <CardBody className="space-y-5">
              {membersError && (
                <Alert type="error" message={membersError} onClose={() => setMembersError(null)} />
              )}

              <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent-soft/70 p-3.5 text-xs text-accent">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Integrity guard</p>
                  <p className="mt-0.5 leading-relaxed">
                    Every customer account must retain at least one active{' '}
                    <code className="font-mono">account_holder</code>. Serialized database locks prevent
                    removing or downgrading the final holder.
                  </p>
                </div>
              </div>

              {account?.account_type === 'system' ? (
                <div className="rounded-xl border border-line bg-paper/70 p-4 text-xs text-muted">
                  System cash vault ledgers do not use customer memberships.
                </div>
              ) : (
                <form
                  onSubmit={handleAssignMember}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-paper/70 p-4 md:grid-cols-[1.5fr_1fr_auto] md:items-end"
                >
                  <Field label="Select registered user" htmlFor="assign-member-user" required>
                    <Select
                      id="assign-member-user"
                      value={memberUserId}
                      onChange={(event) => setMemberUserId(event.target.value)}
                      disabled={membersLoading || account?.status === 'closed'}
                      required
                    >
                      <option value="">Choose user by email…</option>
                      {registeredUsers.map((registered) => (
                        <option
                          key={registered.id}
                          value={registered.id}
                          disabled={!registered.is_active}
                        >
                          {registered.email} · {registered.role}
                          {!registered.is_active ? ' (suspended)' : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Membership role" htmlFor="assign-member-role" required>
                    <Select
                      id="assign-member-role"
                      value={memberRole}
                      onChange={(event) => setMemberRole(event.target.value)}
                      disabled={membersLoading || account?.status === 'closed'}
                    >
                      <option value="auditor">auditor · read-only access</option>
                      <option value="account_holder">account_holder · full operations</option>
                    </Select>
                  </Field>

                  <Button
                    type="submit"
                    size="md"
                    loading={memberSubmitting}
                    disabled={membersLoading || account?.status === 'closed' || !memberUserId}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {memberSubmitting ? 'Assigning…' : 'Assign'}
                  </Button>
                </form>
              )}

              {membersLoading ? (
                <TableSkeleton rows={3} />
              ) : memberships.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No members assigned"
                  description="Select a registered user above to assign account_holder or auditor access."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-paper/80 text-[10px] font-semibold uppercase tracking-widest text-muted">
                      <tr>
                        <th className="px-4 py-3">User email</th>
                        <th className="px-4 py-3">Account role</th>
                        <th className="px-4 py-3">User role &amp; status</th>
                        <th className="px-4 py-3">Updated</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {memberships.map((member) => {
                        const isSoleHolder =
                          member.role === 'account_holder' && accountHolderCount <= 1;
                        const rowBusy = updatingMemberId === member.user_id;

                        return (
                          <tr key={member.id} className="transition-colors hover:bg-paper/60">
                            <td className="px-4 py-3">
                              <div className="font-medium text-ink">{member.email}</div>
                              <div className="mt-0.5 font-mono text-[10px] text-muted" title={member.user_id}>
                                {member.user_id}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={member.role === 'account_holder' ? 'success' : 'warning'}>
                                {member.role}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="neutral" className="capitalize">
                                  {member.user_role}
                                </Badge>
                                <Badge variant={member.user_is_active ? 'success' : 'danger'}>
                                  {member.user_is_active ? 'active' : 'suspended'}
                                </Badge>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-muted">
                              {formatTimestamp(member.updated_at || member.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <Select
                                  value={member.role}
                                  onChange={(event) => handleRoleChange(member, event.target.value)}
                                  disabled={rowBusy || isSoleHolder || account?.status === 'closed'}
                                  aria-label={`Change role for ${member.email}`}
                                  className="w-36 text-xs"
                                  title={
                                    isSoleHolder
                                      ? 'At least one active account_holder is required'
                                      : 'Change membership role'
                                  }
                                >
                                  <option value="account_holder">account_holder</option>
                                  <option value="auditor">auditor</option>
                                </Select>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="xs"
                                  disabled={rowBusy || isSoleHolder || account?.status === 'closed'}
                                  onClick={() => setPendingRevokeMember(member)}
                                  title={
                                    isSoleHolder
                                      ? 'Cannot remove the final account_holder'
                                      : `Remove ${member.email}`
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>

            <CardFooter>
              <p className="text-[11px] text-muted">
                Authorized access is enforced by Express admin authorization and PostgreSQL row-level security on every request.
              </p>
            </CardFooter>
          </Card>

          <ConfirmDialog
            isOpen={Boolean(pendingRevokeMember)}
            onClose={() => setPendingRevokeMember(null)}
            onConfirm={handleConfirmRevoke}
            title="Remove account membership?"
            description={
              pendingRevokeMember
                ? `Remove ${pendingRevokeMember.email} (${pendingRevokeMember.role}) from account ${account?.account_number}? This immediately revokes their account access and records an immutable audit log entry.`
                : ''
            }
            confirmLabel="Remove member"
            tone="danger"
            loading={revokingMember}
          />
        </div>
      )}
    </div>
  );
}
