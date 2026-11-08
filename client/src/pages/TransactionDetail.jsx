import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import {
  paiseToRupees,
  formatTimestamp,
  generateIdempotencyKey,
  verifyLedgerPostings,
  bigIntAbs,
  transitionReversalState,
} from '../utils/formatters';
import {
  FileText,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import Alert from '../components/Alert';
import Modal from '../components/Modal';

export default function TransactionDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Reversal Modal and State Management
  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  // Store reversal idempotency operation state (key, txId, and immutable payload)
  const [reversalOp, setReversalOp] = useState(() =>
    transitionReversalState(null, { type: 'INIT', txId: id })
  );

  // Guarantee that navigating to a different transaction ID resets the reversal state and key
  useEffect(() => {
    setReversalOp(transitionReversalState(null, { type: 'CHANGE_TX_ID', txId: id }));
    setReverseReason('');
  }, [id]);

  function handleReasonChange(newVal) {
    setReverseReason(newVal);
    // If the reason is changed after a failure, transitionReversalState automatically starts a new operation
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
      setError('Please provide a legitimate reason for the administrative reversal');
      return;
    }

    setReversing(true);
    setError(null);
    try {
      // Re-use persistent idempotency key and request payload across retries
      const res = await api.reverseTransaction(id, {
        reason: trimmedReason,
        idempotencyKey: reversalOp.idempotencyKey,
      });
      setSuccess(`Reversal executed successfully. Compensating Transaction ID: ${res.transaction_id || res.id}`);
      setIsReverseModalOpen(false);
      setReverseReason('');
      // Rotate idempotency key ONLY upon successful execution
      setReversalOp(transitionReversalState(reversalOp, { type: 'SUCCESS' }));
      await loadTransaction();
    } catch (err) {
      // Mark failed attempt so subsequent retries preserve the exact same key and payload
      setReversalOp((prev) =>
        transitionReversalState(prev, {
          type: 'SUBMIT_FAILURE',
          payload: { reason: trimmedReason },
        })
      );
      setError(err.message || 'Reversal failed');
    } finally {
      setReversing(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-24 text-slate-500 text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
        Loading double-entry ledger postings...
      </div>
    );
  }

  const tx = data?.transaction;
  const postings = data?.postings || [];

  // Explicit status-based ledger verification
  const verification = verifyLedgerPostings(tx, postings);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            to="/accounts"
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Transaction Details & Ledger Verification
            </h1>
            <p className="text-xs text-slate-400 font-mono">{id}</p>
          </div>
        </div>

        {isAdmin && tx?.status === 'posted' && tx?.type !== 'reversal' && (
          <button
            onClick={() => setIsReverseModalOpen(true)}
            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Admin Reversal
          </button>
        )}
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

      {tx && (
        <>
          {/* Metadata Grid */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Settled Amount
                </span>
                <div className="text-3xl font-extrabold font-mono text-white">
                  {paiseToRupees(tx.amount_paise)}
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  tx.status === 'posted'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : tx.status === 'refused'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {tx.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Operation Type</span>
                <span className="text-white font-bold capitalize">{tx.type}</span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Currency</span>
                <span className="text-white">{tx.currency || 'INR'}</span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Timestamp</span>
                <span className="text-slate-300">{formatTimestamp(tx.created_at)}</span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 col-span-1 sm:col-span-2 lg:col-span-3">
                <span className="text-slate-500 block mb-1">Created By Actor UUID</span>
                <span className="text-teal-400 break-all">{tx.created_by}</span>
              </div>
              {tx.refusal_reason && (
                <div className="bg-rose-950/30 border border-rose-500/30 p-3.5 rounded-xl col-span-full">
                  <span className="text-rose-400 font-bold block mb-1">Engine Refusal Reason</span>
                  <span className="text-rose-200">{tx.refusal_reason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Double-Entry Ledger Postings Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Double-Entry Ledger Postings
                </h3>
              </div>
              <span className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase border ${verification.badgeClass}`}>
                {verification.label}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Seq #</th>
                    <th className="px-6 py-3">Account UUID</th>
                    <th className="px-6 py-3">Entry Type</th>
                    <th className="px-6 py-3 text-right">Magnitude</th>
                    <th className="px-6 py-3 text-right">Signed Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {postings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Zero postings recorded (as expected for refused or non-settled operations).
                      </td>
                    </tr>
                  ) : (
                    postings.map((p) => {
                      const isCredit = p.entry_type === 'credit';
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-3 text-slate-400">{p.sequence_number}</td>
                          <td className="px-6 py-3 text-slate-300">
                            <Link to={`/accounts/${p.account_id}`} className="text-teal-400 hover:underline">
                              {p.account_id}
                            </Link>
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isCredit
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {p.entry_type}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right text-slate-300">
                            {paiseToRupees(p.amount_paise)}
                          </td>
                          <td
                            className={`px-6 py-3 text-right font-bold ${
                              isCredit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {paiseToRupees(bigIntAbs(p.signed_amount_paise))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Admin Reversal Modal */}
      <Modal
        isOpen={isReverseModalOpen}
        onClose={() => !reversing && setIsReverseModalOpen(false)}
        title="Execute Administrative Reversal"
      >
        <form onSubmit={handleReverse} className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Executing a reversal creates a new compensating financial transaction with mirrored debit/credit
            postings that returns funds to their origin, referencing original transaction{' '}
            <code className="text-teal-400 font-mono">{id}</code>.
          </p>

          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 break-all">
            <span className="text-slate-500 block mb-0.5 uppercase tracking-wider text-[10px]">
              Assigned Idempotency Key (Preserved on Retry)
            </span>
            <span className="text-teal-400 font-semibold">{reversalOp.idempotencyKey}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Auditable Justification / Reason
            </label>
            <textarea
              rows={3}
              value={reverseReason}
              onChange={(e) => handleReasonChange(e.target.value)}
              disabled={reversing}
              placeholder="e.g. Disputed transaction investigation case #8392"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 disabled:opacity-50"
            />
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              disabled={reversing}
              onClick={() => setIsReverseModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reversing || !reverseReason.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {reversing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Reversal...</span>
                </>
              ) : (
                'Execute Reversal'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
