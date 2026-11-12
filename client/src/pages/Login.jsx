import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, User, ShieldCheck, Eye } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/Alert';
import { Button, Field, Input, PasswordInput } from '../components/ui';
import { DEMO_ACCOUNTS } from '../utils/demoAccounts';

const demoStyleByRole = {
  admin: {
    icon: ShieldCheck,
    cardClass:
      'border-warning/30 bg-warning-soft/40 hover:border-warning/60 hover:bg-warning-soft/75',
    badgeClass: 'bg-warning-soft text-warning ring-warning/20',
  },
  auditor: {
    icon: Eye,
    cardClass:
      'border-accent/30 bg-accent-soft/40 hover:border-accent/60 hover:bg-accent-soft/75',
    badgeClass: 'bg-accent-soft text-accent ring-accent/20',
  },
  customer: {
    icon: User,
    cardClass:
      'border-brand/30 bg-brand-soft/50 hover:border-brand/60 hover:bg-brand-soft/85',
    badgeClass: 'bg-brand-soft text-brand ring-brand/20',
  },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedDemoId, setSelectedDemoId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { login, authError, setAuthError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  function validate() {
    const next = {};
    if (!email.trim()) next.email = 'Enter your email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Enter your password';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);
    setAuthError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFillDemo(account) {
    setEmail(account.email);
    setPassword(account.password);
    setSelectedDemoId(account.id);
    setFieldErrors({});
    setError(null);
    setAuthError(null);
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-ledger sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
              Secure sign in
            </span>
          </div>
          <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
            Welcome back to LedgerLine
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Access your accounts, statements, and money movement tools.
          </p>
        </div>

        {(error || authError) && (
          <div className="mb-5">
            <Alert
              type="error"
              message={error || authError}
              onClose={() => {
                setError(null);
                setAuthError(null);
              }}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Email address" htmlFor="login-email" error={fieldErrors.email} required>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (selectedDemoId) setSelectedDemoId(null);
                if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              placeholder="you@company.com"
              autoComplete="email"
              icon={Mail}
              error={fieldErrors.email}
              required
            />
          </Field>

          <Field label="Password" htmlFor="login-password" error={fieldErrors.password} required>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (selectedDemoId) setSelectedDemoId(null);
                if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              placeholder="Enter your password"
              autoComplete="current-password"
              icon={Lock}
              error={fieldErrors.password}
              required
            />
          </Field>

          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
            {loading ? 'Authenticating…' : 'Sign in'}
            {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </form>

        <section
          aria-label="Quick Demo Login"
          className="mt-5 rounded-xl border border-line bg-paper p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
              Quick Demo Login
            </h2>
            {selectedDemoId && (
              <span className="text-[10px] font-medium text-brand">
                Filled · Click Sign in
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Demo accounts — use these credentials to explore role-based features.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((demoAccount) => {
              const style = demoStyleByRole[demoAccount.id] || demoStyleByRole.customer;
              const Icon = style.icon;
              const selected = selectedDemoId === demoAccount.id;

              return (
                <button
                  key={demoAccount.id}
                  type="button"
                  onClick={() => handleQuickFillDemo(demoAccount)}
                  aria-pressed={selected}
                  className={`flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-all ${style.cardClass} ${
                    selected ? 'ring-2 ring-brand/40 shadow-sm' : ''
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-ink">{demoAccount.role}</span>
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-md ring-1 ${style.badgeClass}`}
                    >
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </span>
                  <span className="mt-1 w-full truncate font-mono text-[10px] text-ink-soft" title={demoAccount.email}>
                    {demoAccount.email}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted">{demoAccount.summary}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" aria-hidden="true" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">New here?</span>
          <div className="h-px flex-1 bg-line" aria-hidden="true" />
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Create a customer account
          </Link>
        </p>
      </div>

      <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">
        Sessions are stored in this browser tab only. Sign in again if the tab is closed.
      </p>
    </AuthLayout>
  );
}
