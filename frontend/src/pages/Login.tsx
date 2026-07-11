import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TwoFactorRequiredError } from '../lib/api';
import { Container } from '../components/ui/Container';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

type Mode = 'login' | 'register';

export const Login = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/';

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Two-factor step (shown after a correct password when the account has 2FA).
  const [needs2fa, setNeeds2fa] = useState(false);
  const [totp, setTotp] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password, needs2fa ? totp : undefined);
      } else {
        await register(email, password, name.trim() || undefined);
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof TwoFactorRequiredError) {
        setNeeds2fa(true);
        setError('');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancel2fa = () => {
    setNeeds2fa(false);
    setTotp('');
    setPassword('');
    setError('');
  };

  const switchMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setError('');
  };

  return (
    <>
      <Helmet>
        <title>{mode === 'login' ? 'Sign in' : 'Create account'} | Scriptory</title>
      </Helmet>
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
        <Container className="max-w-sm w-full">
          <div className="glass rounded-3xl p-8 shadow-xl shadow-black/10">
            <Link to="/" className="mb-6 inline-flex items-center gap-2.5">
              <span className="h-4 w-4 rotate-45 rounded-[4px] bg-brand shadow-sm shadow-brand/40" />
              <span className="font-display text-lg font-extrabold tracking-tight">Scriptory</span>
            </Link>
            {needs2fa ? (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand" />
                  <h1 className="font-display text-2xl font-bold">Two-factor</h1>
                </div>
                <p className="mb-6 text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app.
                </p>

                {error && (
                  <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    aria-label="Authentication code"
                    value={totp}
                    onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="text-center text-lg tracking-[0.5em]"
                    required
                  />
                  <Button type="submit" variant="brand" className="w-full" disabled={loading || totp.length !== 6}>
                    {loading ? 'Verifying…' : 'Verify'}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={cancel2fa}
                  className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              </>
            ) : (
              <>
                <h1 className="mb-1 font-display text-2xl font-bold">
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </h1>
                <p className="mb-6 text-sm text-muted-foreground">
                  {mode === 'login'
                    ? 'Welcome back to Scriptory'
                    : 'Join Scriptory to read and explore'}
                </p>

                {error && (
                  <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'register' && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium" htmlFor="name">
                        Name <span className="text-muted-foreground">(optional)</span>
                      </label>
                      <Input
                        id="name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="password">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    {mode === 'register' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Minimum 8 characters, with a letter and a number
                      </p>
                    )}
                  </div>
                  <Button type="submit" variant="brand" className="w-full" disabled={loading}>
                    {loading
                      ? mode === 'login' ? 'Signing in…' : 'Creating account…'
                      : mode === 'login' ? 'Sign in' : 'Create account'}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                  <button
                    type="button"
                    onClick={switchMode}
                    className="font-semibold text-brand hover:underline"
                  >
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              </>
            )}
          </div>
        </Container>
      </div>
    </>
  );
};
