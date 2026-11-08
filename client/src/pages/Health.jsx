import React, { useState, useEffect, useCallback } from 'react';
import { getHealthStatus } from '../services/api';
import { Activity, RefreshCw, Server, Database, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function Health() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getHealthStatus();
      setHealth(response);
    } catch (err) {
      setHealth({
        ok: false,
        error: err.message || 'Unknown network error',
      });
    } finally {
      setLoading(false);
      setLastChecked(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const dbStatus = health?.data?.database?.status || (health?.ok ? 'UNKNOWN' : 'DISCONNECTED');
  const serverStatus = health?.data?.status || (health?.ok ? 'UP' : 'DOWN');

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            System Health & Telemetry
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time infrastructure probes and database connection verification.
          </p>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          {loading ? 'Probing...' : 'Refresh Telemetry'}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* API Server Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Express API Server</h3>
                <span className="text-[11px] text-slate-400 font-mono">Node.js ES Modules</span>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                serverStatus === 'UP'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  serverStatus === 'UP' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              {serverStatus}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono pt-3 border-t border-slate-800/80">
            <div className="flex justify-between text-slate-400">
              <span>Endpoint:</span>
              <span className="text-slate-200">/api/health</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Round-Trip Latency:</span>
              <span className="text-teal-400 font-bold">
                {health?.latencyMs !== undefined ? `${health.latencyMs} ms` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>System Uptime:</span>
              <span className="text-slate-200">
                {health?.data?.uptimeSeconds !== undefined ? `${health.data.uptimeSeconds}s` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* PostgreSQL Database Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">PostgreSQL Ledger Database</h3>
                <span className="text-[11px] text-slate-400 font-mono">node-postgres (pg-pool)</span>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                dbStatus === 'CONNECTED'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dbStatus === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              {dbStatus}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono pt-3 border-t border-slate-800/80">
            <div className="flex justify-between text-slate-400">
              <span>Driver Verification:</span>
              <span className="text-slate-200">SELECT 1</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Query Latency:</span>
              <span className="text-teal-400 font-bold">
                {health?.data?.database?.latencyMs !== undefined
                  ? `${health.data.database.latencyMs} ms`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Isolation Engine:</span>
              <span className="text-slate-200">RLS + Session Context</span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-right text-[11px] text-slate-500 font-mono">
        Last polled: {lastChecked || '—'} (Auto-refreshes every 15s)
      </div>
    </div>
  );
}
