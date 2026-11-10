import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, User } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/Alert';
import { Button, Field, Input, PasswordInput } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  function handlePrefillEmail(sampleEmail) {
    setEmail(sampleEmail);
    setFieldErrors((current) => ({ ...current, email: undefined }));
    setError(null);
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in to LedgerLine</h1>
        <p className="mt-1 text-sm text-muted">Access your accounts, statements, and money movement tools.</p>
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

      {import.meta.env.DEV && (
        <div className="mt-6 rounded-lg border border-line bg-slate-50 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            Development helper · email pre-fill only
          </div>
          <button
            type="button"
            onClick={() => handlePrefillEmail('customerA@test.local')}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-slate-100"
          >
            <User className="h-3 w-3 text-brand" aria-hidden="true" />
            customerA@test.local
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-semibold text-brand hover:underline">
          Create a customer account
        </Link>
      </p>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
        Sessions are stored in this browser tab only. Sign in again if the tab is closed.
      </p>
    </AuthLayout>
  );
}
