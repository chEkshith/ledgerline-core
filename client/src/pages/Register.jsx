import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Alert from '../components/Alert';
import { Button, Field, Input, PasswordInput } from '../components/ui';

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
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Create your LedgerLine account</h1>
        <p className="mt-1 text-sm text-muted">Open a customer profile to start moving money with a verifiable ledger.</p>
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

        <Field
          label="Password"
          htmlFor="register-password"
          hint="Minimum 8 characters."
          error={fieldErrors.password}
          required
        >
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

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
        New accounts start with a customer profile. Account access is granted by an account holder or administrator.
      </p>
    </AuthLayout>
  );
}
