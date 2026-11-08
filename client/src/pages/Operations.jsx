import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import {
  rupeesToPaise,
  paiseToRupees,
  generateIdempotencyKey,
  formatTimestamp,
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
} from 'lucide-react';
import Alert from '../components/Alert';

export default function Operations() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [operationType, setOperationType] = useState(searchParams.get('type') || 'transfer');
  const [accounts, setAccounts] = useState([]);
  const [sourceAccountId, setSourceAccountId] = useState(searchParams.get('source') || '');
  const [destinationAccountId, setDestinationAccountId] = useState(
    searchParams.get('destination') || ''
  );
  const [amountRupees, setAmountRupees] = useState('');

  // Active Form Idempotency Key
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Last settled transaction payload and key for genuine replay demonstration
  const [lastSettledTx, setLastSettledTx] = useState(null);
  const [replaying, setReplaying] = useState(false);

  // Load user accounts and vault account
  const loadAccounts = useCallback(async () => {
    try {
      const list = await api.listAccounts();
      setAccounts(list || []);

      const vault = list.find((a) => a.system_role_type === 'SYSTEM_CASH_VAULT');
      const firstCustomer = list.find((a) => a.account_type === 'customer');

      if (operationType === 'deposit') {
        if (vault) setSourceAccountId(vault.id);
        if (!destinationAccountId && firstCustomer) setDestinationAccountId(firstCustomer.id);
      } else if (operationType === 'withdraw') {
        if (!sourceAccountId && firstCustomer) setSourceAccountId(firstCustomer.id);
        if (vault) setDestinationAccountId(vault.id);
      } else if (operationType === 'transfer') {
        if (!sourceAccountId && firstCustomer) setSourceAccountId(firstCustomer.id);
      }
    } catch {
      setError('Failed to load accounts for transfer setup');
    }
  }, [operationType, sourceAccountId, destinationAccountId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  function handleTypeChange(type) {
    setOperationType(type);
    setResult(null);
    setError(null);
    setSearchParams({ type });

    const vault = accounts.find((a) => a.system_role_type === 'SYSTEM_CASH_VAULT');
    const firstCustomer = accounts.find((a) => a.account_type === 'customer');

    if (type === 'deposit') {
      if (vault) setSourceAccountId(vault.id);
      if (firstCustomer) setDestinationAccountId(firstCustomer.id);
    } else if (type === 'withdraw') {
      if (firstCustomer) setSourceAccountId(firstCustomer.id);
      if (vault) setDestinationAccountId(vault.id);
    } else if (type === 'transfer') {
      if (firstCustomer) setSourceAccountId(firstCustomer.id);
      setDestinationAccountId('');
    }
  }

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setResult(null);

    let paiseAmount;
    try {
      paiseAmount = rupeesToPaise(amountRupees);
    } catch (valErr) {
      setError(valErr.message);
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
      type: operationType,
      amountPaise: paiseAmount,
      sourceAccountId,
      destinationAccountId,
    };

    setSubmitting(true);
    try {
      const res = await api.executeTransaction({
        ...payload,
        idempotencyKey,
      });

      // Save as last settled transaction
      setLastSettledTx({
        key: idempotencyKey,
        payload,
        result: res,
      });

      setResult(res);

      // Rotate key for subsequent genuine new operations
      setIdempotencyKey(generateIdempotencyKey());

      // Refresh accounts in background
      loadAccounts();
    } catch (err) {
      // NOTE: Key is preserved on failure so retrying sends the identical key
      setError(err.message || 'Transaction failed or was refused by engine');
    } finally {
      setSubmitting(false);
    }
  }

  // Real Replay Demonstration: Sends a genuine duplicate request to the backend with the same key
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

  function handleCopyKey() {
    navigator.clipboard.writeText(idempotencyKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  function handleNewKey() {
    setIdempotencyKey(generateIdempotencyKey());
    setResult(null);
    setError(null);
  }

  const customerAccounts = accounts.filter((a) => a.account_type === 'customer');
  const vaultAccount = accounts.find((a) => a.system_role_type === 'SYSTEM_CASH_VAULT');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="pb-6 border-b border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Money Movement Engine
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Execute deposits, withdrawals, and peer transfers with end-to-end idempotency protection.
        </p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* Operation Type Switcher */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => handleTypeChange('deposit')}
          className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3 ${
            operationType === 'deposit'
              ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              operationType === 'deposit'
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}
          >
            <ArrowDownLeft className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Deposit</div>
            <div className="text-xs text-slate-400">Vault &rarr; Account</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleTypeChange('withdraw')}
          className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3 ${
            operationType === 'withdraw'
              ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              operationType === 'withdraw'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-500/10 text-amber-400'
            }`}
          >
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Withdraw</div>
            <div className="text-xs text-slate-400">Account &rarr; Vault</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleTypeChange('transfer')}
          className={`p-4 rounded-2xl border text-left transition-all flex items-center gap-3 ${
            operationType === 'transfer'
              ? 'bg-teal-950/40 border-teal-500/50 shadow-lg shadow-teal-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              operationType === 'transfer'
                ? 'bg-teal-500 text-white'
                : 'bg-teal-500/10 text-teal-400'
            }`}
          >
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Transfer</div>
            <div className="text-xs text-slate-400">Account &rarr; Account</div>
          </div>
        </button>
      </div>

      {/* Main Form & Idempotency Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6"
        >
          {/* Source Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Source (Debit Account)
            </label>
            {operationType === 'deposit' ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-mono text-slate-300 flex items-center justify-between">
                <span>System Cash Vault</span>
                <span className="text-xs text-slate-500">{vaultAccount?.id}</span>
              </div>
            ) : (
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
              >
                <option value="">Select source account...</option>
                {customerAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.account_number} — Balance: {paiseToRupees(acc.current_balance)} (
                    {acc.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Destination Account */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Destination (Credit Account)
            </label>
            {operationType === 'withdraw' ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-mono text-slate-300 flex items-center justify-between">
                <span>System Cash Vault</span>
                <span className="text-xs text-slate-500">{vaultAccount?.id}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500 font-mono"
                >
                  <option value="">Select destination account...</option>
                  {customerAccounts
                    .filter((a) => a.id !== sourceAccountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_number} — Balance: {paiseToRupees(acc.current_balance)}
                      </option>
                    ))}
                </select>
                {operationType === 'transfer' && (
                  <input
                    type="text"
                    value={destinationAccountId}
                    onChange={(e) => setDestinationAccountId(e.target.value)}
                    placeholder="Or enter recipient Account UUID directly..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                  />
                )}
              </div>
            )}
          </div>

          {/* Amount in Rupees */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Amount (INR ₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                ₹
              </span>
              <input
                type="text"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="100.00"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-lg font-mono font-bold text-white placeholder-slate-600 focus:outline-none focus:border-teal-500"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-teal-400" />
              Settles internally in integer minor currency (paise). Zero floating-point rounding.
            </p>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={submitting || replaying}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 active:scale-[0.99] disabled:opacity-50 transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Settling Double-Entry Ledger...
              </>
            ) : error ? (
              <>
                <RotateCcw className="w-4 h-4" />
                Retry Operation (Same Idempotency Key)
              </>
            ) : (
              `Execute ${operationType.toUpperCase()}`
            )}
          </button>
        </form>

        {/* Idempotency & Replay Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-teal-400 font-bold text-sm mb-2">
              <ShieldCheck className="w-4 h-4" />
              Idempotency Invariant
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Every financial mutation requires a unique client-generated UUID key. Repeating a request
              with the same key returns the exact cached response without double debit.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  Active Request Key
                </span>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedKey ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-xs font-mono text-slate-300 break-all">{idempotencyKey}</div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleNewKey}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Generate Fresh Key
            </button>

            {lastSettledTx && (
              <button
                type="button"
                onClick={handleSimulateRealReplay}
                disabled={replaying || submitting}
                className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-semibold text-amber-300 rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Repeat className={`w-3.5 h-3.5 ${replaying ? 'animate-spin' : ''}`} />
                {replaying ? 'Sending Replay...' : 'Send Live Replay (Same Key)'}
              </button>
            )}

            <p className="text-[10px] text-slate-500 text-center">
              Replays transmit genuine duplicate HTTP requests to test server idempotency resolution.
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Result Modal / Card */}
      {result && (
        <div className="bg-slate-900 border border-teal-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4 animate-scaleIn">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Transaction {result.status === 'success' ? 'Settled & Posted' : 'Processed'}
                </h3>
                <span className="text-xs font-mono text-teal-400">
                  ID: {result.transaction_id || result.id}
                </span>
              </div>
            </div>

            {result.isIdempotentReplay && (
              <span className="px-3 py-1 rounded-full text-xs font-bold font-mono uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Idempotent Replay Confirmed
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-800 font-mono text-xs">
            <div>
              <span className="text-slate-500 block">Status:</span>
              <span className="text-white font-bold capitalize">{result.status}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Settled Amount:</span>
              <span className="text-emerald-400 font-bold">
                {paiseToRupees(result.amount_paise)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Currency:</span>
              <span className="text-white">{result.currency || 'INR'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Postings Generated:</span>
              <span className="text-teal-400 font-bold">2 (Balanced Double-Entry)</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              to={`/transactions/${result.transaction_id || result.id}`}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              View Double-Entry Ledger Postings <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
