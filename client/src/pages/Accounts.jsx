import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { paiseToRupees, formatTimestamp } from '../utils/formatters';
import {
  Wallet,
  PlusCircle,
  Search,
  ExternalLink,
  Shield,
  Layers,
  RefreshCw,
  Building,
} from 'lucide-react';
import Alert from '../components/Alert';
import Modal from '../components/Modal';

export default function Accounts() {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // New Account Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newCurrency, setNewCurrency] = useState('INR');
  const [submitting, setSubmitting] = useState(false);

  // Filter State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
    if (searchParams.get('action') === 'create') {
      setIsModalOpen(true);
    }
  }, [loadAccounts, searchParams]);

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
      setSuccess(`Account ${res.accountNumber} created successfully`);
      setIsModalOpen(false);
      setNewAccNumber('');
      setSearchParams({});
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

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.account_number?.toLowerCase().includes(search.toLowerCase()) ||
      acc.id?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || acc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Account Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Secure vault & customer ledgers with Row-Level Security isolation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadAccounts}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
          <button
            onClick={() => {
              generateSampleAccNumber();
              setIsModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Open Account
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by account number or UUID..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-teal-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="frozen">Frozen Only</option>
          <option value="closed">Closed Only</option>
        </select>
      </div>

      {/* Accounts Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading accounts...</div>
      ) : filteredAccounts.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-3">
          <Wallet className="w-12 h-12 text-slate-600 mx-auto" />
          <div className="text-lg font-bold text-white">No Accounts Found</div>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            No accounts match your current filters. Open a new customer account to begin transactions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAccounts.map((acc) => {
            const isSystem = acc.account_type === 'system';
            return (
              <div
                key={acc.id}
                className={`bg-slate-900 border rounded-2xl p-6 transition-all hover:border-slate-700 flex flex-col justify-between ${
                  isSystem ? 'border-indigo-500/30' : 'border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {isSystem ? (
                        <Building className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Wallet className="w-4 h-4 text-teal-400" />
                      )}
                      <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">
                        {acc.account_number}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        acc.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : acc.status === 'frozen'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {acc.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                      Current Ledger Balance
                    </span>
                    <div className="text-2xl font-extrabold font-mono text-white">
                      {paiseToRupees(acc.current_balance)}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400 pt-3 border-t border-slate-800">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="font-medium text-slate-200 capitalize">
                        {acc.system_role_type || acc.account_type}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Currency:</span>
                      <span className="font-mono text-slate-200">{acc.currency || 'INR'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Created:</span>
                      <span>{formatTimestamp(acc.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                  <Link
                    to={`/accounts/${acc.id}`}
                    className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors"
                  >
                    View Details & Statement <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    to={`/operations?type=transfer&source=${acc.id}`}
                    className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    Transfer
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Account Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Open New Customer Account">
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Account Number
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAccNumber}
                onChange={(e) => setNewAccNumber(e.target.value)}
                placeholder="e.g. ACC-IN-83920194"
                required
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
              />
              <button
                type="button"
                onClick={generateSampleAccNumber}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl transition-colors shrink-0"
              >
                Auto-Generate
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Initial status will be active with initial balance ₹0.00.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Currency
            </label>
            <select
              value={newCurrency}
              onChange={(e) => setNewCurrency(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
            >
              <option value="INR">INR (Indian Rupee - ₹)</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
