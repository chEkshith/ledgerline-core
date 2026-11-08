import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { paiseToRupees, formatTimestamp } from '../utils/formatters';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import Alert from '../components/Alert';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accs = await api.listAccounts();
      setAccounts(accs || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter out system accounts for user balance calculation
  const customerAccounts = accounts.filter((a) => a.account_type === 'customer');
  const systemAccounts = accounts.filter((a) => a.account_type === 'system');

  // Compute total balance in paise safely with BigInt
  const totalBalancePaise = customerAccounts.reduce((acc, curr) => {
    try {
      return acc + BigInt(curr.current_balance || '0');
    } catch {
      return acc;
    }
  }, 0n);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Financial Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time balance settlement with immutable double-entry ledger verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
            title="Refresh Data"
            aria-label="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
          <Link
            to="/operations"
            className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Move Money
          </Link>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Total Net Balance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-colors pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Customer Balance
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
            {loading ? '—' : paiseToRupees(totalBalancePaise)}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400 inline-block animate-pulse" />
            <span>Across {customerAccounts.length} customer accounts</span>
          </div>
        </div>

        {/* Customer Accounts Count */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Accounts
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
            {loading ? '—' : customerAccounts.length}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Customer wallets</span>
            <Link to="/accounts" className="text-teal-400 hover:underline flex items-center gap-1">
              View all <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Security / System Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Security Context
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-white font-mono">
            {user?.role?.toUpperCase()}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-teal-500/15 text-teal-400 border border-teal-500/30">
              HMAC Verified
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              RLS Enforced
            </span>
          </div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Quick Financial Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            to="/operations?type=deposit"
            className="p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/50 rounded-xl transition-all flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Deposit</div>
              <div className="text-[11px] text-slate-400">From Vault</div>
            </div>
          </Link>

          <Link
            to="/operations?type=withdraw"
            className="p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Withdraw</div>
              <div className="text-[11px] text-slate-400">To Cash Vault</div>
            </div>
          </Link>

          <Link
            to="/operations?type=transfer"
            className="p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 rounded-xl transition-all flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Transfer</div>
              <div className="text-[11px] text-slate-400">Between Accounts</div>
            </div>
          </Link>

          <Link
            to="/accounts?action=create"
            className="p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/50 rounded-xl transition-all flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">New Account</div>
              <div className="text-[11px] text-slate-400">Open Account</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-bold text-white">Your Managed Accounts</h2>
          </div>
          <Link
            to="/accounts"
            className="text-xs font-semibold text-teal-400 hover:underline flex items-center gap-1"
          >
            Manage Accounts <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading accounts...</div>
          ) : customerAccounts.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <Wallet className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-slate-400 text-sm">No customer accounts registered yet.</div>
              <Link
                to="/accounts?action=create"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Open First Account
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customerAccounts.map((acc) => (
                <Link
                  key={acc.id}
                  to={`/accounts/${acc.id}`}
                  className="p-5 bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800/80 hover:border-teal-500/50 rounded-xl transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono text-slate-400 tracking-wider">
                        {acc.account_number}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          acc.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {acc.status}
                      </span>
                    </div>
                    <div className="text-xl font-bold font-mono text-white group-hover:text-teal-400 transition-colors">
                      {paiseToRupees(acc.current_balance)}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span className="capitalize">{acc.account_type}</span>
                    <span className="text-teal-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-medium">
                      Statement &rarr;
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
