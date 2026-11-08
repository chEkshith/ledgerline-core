import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { ShieldCheck, UserX, UserCheck, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import Alert from '../components/Alert';

export default function Admin() {
  const { user } = useAuth();

  // User status state
  const [targetUserId, setTargetUserId] = useState('');
  const [targetStatus, setTargetStatus] = useState('false');
  const [statusReason, setStatusReason] = useState('');
  const [userStatusLoading, setUserStatusLoading] = useState(false);

  // Reversal lookup state
  const [reverseTxId, setReverseTxId] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleUserStatus(e) {
    e.preventDefault();
    if (!targetUserId.trim() || !statusReason.trim()) {
      setError('Target User UUID and Reason are required');
      return;
    }

    setUserStatusLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const isActive = targetStatus === 'true';
      await api.setUserStatus(targetUserId.trim(), isActive, statusReason.trim());
      setSuccess(`User status updated to ${isActive ? 'ACTIVE' : 'SUSPENDED'} and attributed in audit log.`);
      setTargetUserId('');
      setStatusReason('');
    } catch (err) {
      setError(err.message || 'Failed to update user status');
    } finally {
      setUserStatusLoading(false);
    }
  }

  async function handleReversal(e) {
    e.preventDefault();
    if (!reverseTxId.trim() || !reverseReason.trim()) {
      setError('Transaction ID and Reason are required');
      return;
    }

    setReversalLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.reverseTransaction(reverseTxId.trim(), {
        reason: reverseReason.trim(),
      });
      setSuccess(`Reversal successfully executed. Reversal Transaction ID: ${res.transaction_id || res.id}`);
      setReverseTxId('');
      setReverseReason('');
    } catch (err) {
      setError(err.message || 'Reversal execution failed');
    } finally {
      setReversalLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="pb-6 border-b border-slate-800">
        <div className="flex items-center gap-2 text-amber-400 font-mono text-xs uppercase tracking-wider font-bold mb-1">
          <ShieldCheck className="w-4 h-4" />
          Restricted Administrative Console
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          System Governance & Reversals
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Perform authorized user lifecycle adjustments and compensating ledger reversals under verified admin identity.
        </p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Lifecycle Management Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Modify User Status</h2>
              <p className="text-xs text-slate-400">Suspends or restores user database authentication</p>
            </div>
          </div>

          <form onSubmit={handleUserStatus} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Target User UUID
              </label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Desired Active Status
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-teal-500"
              >
                <option value="false">Suspend User (is_active = FALSE)</option>
                <option value="true">Activate User (is_active = TRUE)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Audit Reason
              </label>
              <input
                type="text"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Velocity alert triggered, compliance hold"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={userStatusLoading}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {userStatusLoading ? 'Applying...' : 'Apply Status Change'}
            </button>
          </form>
        </div>

        {/* Ledger Reversal Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Reverse Transaction</h2>
              <p className="text-xs text-slate-400">Generates compensating ledger postings</p>
            </div>
          </div>

          <form onSubmit={handleReversal} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Original Transaction UUID
              </label>
              <input
                type="text"
                value={reverseTxId}
                onChange={(e) => setReverseTxId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Reversal Justification
              </label>
              <input
                type="text"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="e.g. Erroneous payment, disputed transaction"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={reversalLoading}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {reversalLoading ? 'Processing Reversal...' : 'Execute Ledger Reversal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
