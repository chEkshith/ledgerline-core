import React, { useState, useEffect, useCallback } from 'react';
import { getHealthStatus } from './services/api';
import './App.css';

export default function App() {
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
  }, [fetchHealth]);

  const dbStatus = health?.data?.database?.status || (health?.ok ? 'UNKNOWN' : 'DISCONNECTED');
  const serverStatus = health?.data?.status || (health?.ok ? 'UP' : 'DOWN');

  return (
    <div className="app-container">
      {/* Brand Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-icon">LL</div>
          <div>
            <h1 className="brand-title">LedgerLine</h1>
            <p className="brand-tagline">Secure Financial Transaction Management System</p>
          </div>
        </div>
        <div className="env-badge">PERN Monorepo</div>
      </header>

      {/* Hero Welcome Card */}
      <section className="hero-card">
        <h2 className="hero-title">Welcome to LedgerLine Core</h2>
        <p className="hero-desc">
          Foundation phase initialized. The system establishes a resilient, layered architecture
          tailored for auditability, strict financial integrity, and zero floating-point arithmetic.
        </p>
      </section>

      {/* Live System Health Monitor */}
      <section className="status-section">
        <div className="status-header">
          <h2>System Health & Connectivity</h2>
          <button
            className="btn-refresh"
            onClick={fetchHealth}
            disabled={loading}
            aria-label="Refresh Health Status"
          >
            {loading ? 'Checking...' : '↻ Refresh Status'}
          </button>
        </div>

        <div className="status-grid">
          {/* Server Card */}
          <div className="status-card">
            <div className="status-card-label">Backend API (Express)</div>
            <div className={`status-pill ${serverStatus === 'UP' ? 'up' : 'down'}`}>
              <span className="status-dot"></span>
              {loading ? 'Checking...' : serverStatus}
            </div>
            <div className="status-card-detail">
              <span>Endpoint: <strong>/api/health</strong></span>
              <span>Round-trip Latency: <strong>{health?.latencyMs !== undefined ? `${health.latencyMs} ms` : '—'}</strong></span>
              <span>Uptime: <strong>{health?.data?.uptimeSeconds !== undefined ? `${health.data.uptimeSeconds}s` : '—'}</strong></span>
            </div>
          </div>

          {/* Database Card */}
          <div className="status-card">
            <div className="status-card-label">Database (PostgreSQL)</div>
            <div className={`status-pill ${dbStatus === 'CONNECTED' ? 'up' : 'down'}`}>
              <span className="status-dot"></span>
              {loading ? 'Checking...' : dbStatus}
            </div>
            <div className="status-card-detail">
              <span>Driver: <strong>node-postgres (pg)</strong></span>
              <span>Query Latency: <strong>{health?.data?.database?.latencyMs !== undefined && health.data.database.latencyMs !== null ? `${health.data.database.latencyMs} ms` : '—'}</strong></span>
              <span>Verification: <strong>SELECT 1</strong></span>
            </div>
          </div>

          {/* Environment Card */}
          <div className="status-card">
            <div className="status-card-label">Runtime Environment</div>
            <div className="status-pill up">
              <span className="status-dot"></span>
              Development
            </div>
            <div className="status-card-detail">
              <span>Security Headers: <strong>Helmet Active</strong></span>
              <span>Last Checked: <strong>{lastChecked || 'Initialising...'}</strong></span>
              <span>Payload Parser: <strong>JSON (10kb limit)</strong></span>
            </div>
          </div>
        </div>

        {/* Error or Degraded State Notice */}
        {health && !health.ok && (
          <div className="error-banner">
            <strong>Connectivity Alert:</strong>{' '}
            {health.data?.database?.error || health.error || 'Backend or database service is unreachable.'}
          </div>
        )}
      </section>

      {/* Layered Monorepo Architecture Overview */}
      <section className="architecture-section">
        <div className="arch-card">
          <h3>Routing & Controllers</h3>
          <p>Thin HTTP boundaries with Helmet security, CORS isolation, and JSON size limits.</p>
        </div>
        <div className="arch-card">
          <h3>Services & Business Logic</h3>
          <p>Strict transaction boundaries and financial invariant verification.</p>
        </div>
        <div className="arch-card">
          <h3>Repositories & Database</h3>
          <p>Connection pooled PostgreSQL client (`pg`) using parameterized queries only.</p>
        </div>
        <div className="arch-card">
          <h3>Zod Validation</h3>
          <p>Schema boundary enforcement protecting against invalid payloads and injection.</p>
        </div>
      </section>

      {/* Financial Guardrails Notice */}
      <footer className="guardrails-box">
        <div className="guardrails-title">Financial Integrity Guardrails Active</div>
        <ul className="guardrails-list">
          <li>Minor-unit currency calculations (integer cents, zero IEEE-754 floats)</li>
          <li>Parameterized SQL statements to eliminate injection vectors</li>
          <li>Centralized error handling preventing production stack leakage</li>
          <li>Strict separation of frontend API service layer</li>
        </ul>
      </footer>
    </div>
  );
}

