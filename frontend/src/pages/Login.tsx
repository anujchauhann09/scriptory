import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Container } from '../components/ui/Container';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Helmet } from 'react-helmet-async';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name.trim() || undefined);
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
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
      <div className="flex min-h-[80vh] items-center justify-center">
        <Container className="max-w-sm w-full">
          <div className="rounded-xl border bg-card p-8 shadow-sm">
            <h1 className="mb-1 text-2xl font-bold">
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
                  <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
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
                className="font-medium text-primary hover:underline"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </Container>
      </div>
    </>
  );
};
