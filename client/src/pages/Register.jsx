import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, Check, Minus } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/Alert';
import { Button, Field, Input, PasswordInput } from '../components/ui';

const passwordRules = [
  { label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { label: 'Contains a number', test: (value) => /\d/.test(value) },
  { label: 'Contains a symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  function validate() {
    const next = {};
    if (!email.trim()) next.email = 'Enter your email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Create a password';
    else if (password.length < 8) next.password = 'Use at least 8 characters';
    if (!confirmPassword) next.confirmPassword = 'Confirm your password';
    else if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);
    try {
      await register(email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-ledger sm:p-7">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brass">
              Open your ledger
            </span>
          </div>
          <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
            Create your LedgerLine account
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Open a customer profile to start moving money with a verifiable ledger.
          </p>
        </div>

        {error && (
          <div className="mb-5">
            <Alert type="error" message={error} onClose={() => setError(null)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field label="Email address" htmlFor="register-email" error={fieldErrors.email} required>
            <Input
              id="register-email"
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

          <Field label="Password" htmlFor="register-password" error={fieldErrors.password} required>
            <PasswordInput
              id="register-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              placeholder="Create a password"
              autoComplete="new-password"
              icon={Lock}
              error={fieldErrors.password}
              minLength={8}
              required
            />
            <ul className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-3">
              {passwordRules.map((rule) => {
                const passed = rule.test(password);
                return (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-[10px] transition-colors ${
                      passed ? 'text-success' : 'text-slate-400'
                    }`}
                  >
                    {passed ? (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Minus className="h-3 w-3" aria-hidden="true" />
                    )}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </Field>

          <Field label="Confirm password" htmlFor="register-confirm" error={fieldErrors.confirmPassword} required>
            <PasswordInput
              id="register-confirm"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (fieldErrors.confirmPassword)
                  setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
              }}
              placeholder="Repeat your password"
              autoComplete="new-password"
              icon={Lock}
              error={fieldErrors.confirmPassword}
              required
            />
          </Field>

          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
            {loading ? 'Creating account…' : 'Create account'}
            {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" aria-hidden="true" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Already a member?
          </span>
          <div className="h-px flex-1 bg-line" aria-hidden="true" />
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">
        New accounts start with a customer profile. Account access is granted by an account holder or administrator.
      </p>
    </AuthLayout>
  );
}
