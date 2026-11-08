import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { paiseToRupees, formatTimestamp } from '../utils/formatters';
import {
  Wallet,
  ArrowLeft,
  FileText,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Trash2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import Alert from '../components/Alert';
import Modal from '../components/Modal';

export default function AccountDetail() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('statement');
  const [account, setAccount] = useState(null);
  const [statement, setStatement] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 15, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Status Change State
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Member Assignment State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('account_holder');
  const [memberSubmitting, setMemberSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch account statement (which also returns account details)
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      setSuccess(`Account status updated to ${newStatus}`);
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
      setError('Please provide a valid user UUID');
      return;
    }

    setMemberSubmitting(true);
    setError(null);
    try {
      await api.assignMembership(id, memberUserId.trim(), memberRole);
      setSuccess(`Membership assigned successfully`);
      setIsMemberModalOpen(false);
      setMemberUserId('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to assign membership');
    } finally {
      setMemberSubmitting(false);
    }
  }

  async function handleRevokeMember(targetUserId) {
    if (!window.confirm('Are you sure you want to revoke access for this user?')) {
      return;
    }

    setError(null);
    try {
      await api.revokeMembership(id, targetUserId);
      setSuccess('Membership revoked successfully');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to revoke membership');
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back button & Title */}
      <div className="flex items-center gap-3">
        <Link
          to="/accounts"
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Account Overview</h1>
          <p className="text-slate-400 text-xs font-mono">{id}</p>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

      {/* Account Info Card */}
      {account && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-mono font-bold text-teal-400 uppercase tracking-wider">
                  {account.account_number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    account.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : account.status === 'frozen'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {account.status}
                </span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                {paiseToRupees(account.current_balance)}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Settled currency: <strong className="text-slate-200">{account.currency}</strong> • Type:{' '}
                <strong className="text-slate-200 capitalize">{account.account_type}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/operations?type=deposit&destination=${id}`}
                className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ArrowDownLeft className="w-4 h-4" />
                Deposit
              </Link>
              <Link
                to={`/operations?type=withdraw&source=${id}`}
                className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                Withdraw
              </Link>
              <Link
                to={`/operations?type=transfer&source=${id}`}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                Transfer
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveTab('statement')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'statement'
              ? 'border-teal-500 text-teal-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Statement & Ledger
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-teal-500 text-teal-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings & Status
        </button>

        <button
          onClick={() => setActiveTab('memberships')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'memberships'
              ? 'border-teal-500 text-teal-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Memberships & Access
        </button>
      </div>

      {/* TAB 1: Statement */}
      {activeTab === 'statement' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Chronological Ledger Postings ({pagination.total} total)
            </h3>
            <button
              onClick={loadData}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Seq #</th>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Transaction</th>
                  <th className="px-6 py-3 text-right">Posting Amount</th>
                  <th className="px-6 py-3 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {statement.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No postings recorded on this ledger yet.
                    </td>
                  </tr>
                ) : (
                  statement.map((entry) => {
                    const isCredit = entry.entry_type === 'credit';
                    return (
                      <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors font-mono">
                        <td className="px-6 py-3 text-slate-400">{entry.sequence_number}</td>
                        <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                          {formatTimestamp(entry.created_at)}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isCredit
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {entry.entry_type}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <Link
                            to={`/transactions/${entry.transaction_id}`}
                            className="text-teal-400 hover:underline flex items-center gap-1"
                          >
                            <span className="truncate max-w-[120px]">{entry.transaction_id}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </Link>
                        </td>
                        <td
                          className={`px-6 py-3 text-right font-bold ${
                            isCredit ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {paiseToRupees(entry.amount_paise)}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-200 font-bold">
                          {paiseToRupees(entry.running_balance_paise)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing {pagination.offset + 1} to{' '}
                {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} entries
              </div>
              <div className="flex gap-2">
                <button
                  disabled={pagination.offset === 0}
                  onClick={() =>
                    setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                  onClick={() =>
                    setPagination((p) => ({ ...p, offset: p.offset + p.limit }))
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Settings & Status */}
      {activeTab === 'settings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-2xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Account Operational Status</h3>
            <p className="text-xs text-slate-400">
              Frozen accounts reject debits and credits immediately at the financial engine level.
            </p>
          </div>

          <form onSubmit={handleStatusChange} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Target Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
              >
                <option value="active">Active (Normal Operations)</option>
                <option value="frozen">Frozen (Lock all movements)</option>
                <option value="closed">Closed (Terminal state)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Reason for Change (Audit Tracked)
              </label>
              <input
                type="text"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Risk compliance hold, user request"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={statusSubmitting}
              className="py-2.5 px-5 rounded-xl font-semibold text-sm text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {statusSubmitting ? 'Updating...' : 'Save Account Status'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: Memberships */}
      {activeTab === 'memberships' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Account Members & Roles</h3>
              <p className="text-xs text-slate-400">
                Authorized account holders can initiate transactions; auditors have read-only access.
              </p>
            </div>

            <button
              onClick={() => setIsMemberModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              Add Member
            </button>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Integrity Guard:</strong> An account must always retain at least one active{' '}
              <code className="text-teal-400 font-mono">account_holder</code>. Serialized database triggers
              prevent concurrent revocation of the last holder.
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      <Modal
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        title="Assign Account Membership"
      >
        <form onSubmit={handleAssignMember} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Target User UUID
            </label>
            <input
              type="text"
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Membership Role
            </label>
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
            >
              <option value="account_holder">Account Holder (Full transaction execution)</option>
              <option value="auditor">Auditor (Read-only ledger statement access)</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsMemberModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={memberSubmitting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {memberSubmitting ? 'Assigning...' : 'Assign Membership'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
