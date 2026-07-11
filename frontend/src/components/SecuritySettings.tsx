import React, { useState } from 'react';
import { authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { ShieldCheck, ShieldOff, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';

const codeInputProps = {
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  maxLength: 6,
  placeholder: '000000',
  className: 'text-center text-lg tracking-[0.4em]',
};

export const SecuritySettings = () => {
  const { user, refreshUser } = useAuth();
  const enabled = !!user?.twoFactorEnabled;

  // --- change password ---
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setPwErr('');
    setPwMsg('');
    try {
      await authApi.changePassword(cur, next);
      setPwMsg('Password updated. Other devices have been signed out.');
      setCur('');
      setNext('');
    } catch (err: unknown) {
      setPwErr(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwBusy(false);
    }
  };

  // --- 2FA ---
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [twoBusy, setTwoBusy] = useState(false);
  const [twoErr, setTwoErr] = useState('');

  const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  const startSetup = async () => {
    setTwoErr('');
    setTwoBusy(true);
    try {
      const d = await authApi.twoFactor.setup();
      setSetup({ qrDataUrl: d.qrDataUrl, secret: d.secret });
    } catch (err: unknown) {
      setTwoErr(err instanceof Error ? err.message : 'Failed to start setup');
    } finally {
      setTwoBusy(false);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoBusy(true);
    setTwoErr('');
    try {
      await authApi.twoFactor.enable(code);
      setSetup(null);
      setCode('');
      await refreshUser();
    } catch (err: unknown) {
      setTwoErr(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setTwoBusy(false);
    }
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoBusy(true);
    setTwoErr('');
    try {
      await authApi.twoFactor.disable(disableCode);
      setShowDisable(false);
      setDisableCode('');
      await refreshUser();
    } catch (err: unknown) {
      setTwoErr(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setTwoBusy(false);
    }
  };

  return (
    <div className="mt-10 space-y-6">
      <h2 className="font-display text-xl font-bold tracking-tight">Security</h2>

      {/* Change password */}
      <div className="glass rounded-3xl p-6 shadow-lg shadow-black/5 sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand" />
          <h3 className="font-semibold">Change password</h3>
        </div>
        <form onSubmit={changePw} className="space-y-4">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            required
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            required
          />
          <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
          {pwErr && <p className="text-sm text-destructive">{pwErr}</p>}
          {pwMsg && <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"><CheckCircle2 className="h-4 w-4" />{pwMsg}</p>}
          <Button type="submit" variant="brand" disabled={pwBusy || !cur || !next}>
            {pwBusy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>

      {/* Two-factor */}
      <div className="glass rounded-3xl p-6 shadow-lg shadow-black/5 sm:p-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {enabled ? <ShieldCheck className="h-4 w-4 text-green-500" /> : <ShieldCheck className="h-4 w-4 text-brand" />}
            <h3 className="font-semibold">Two-factor authentication</h3>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${enabled ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Protect your account with a time-based code from an authenticator app (Google Authenticator, Authy, 1Password…).
        </p>

        {twoErr && <p className="mb-3 text-sm text-destructive">{twoErr}</p>}

        {enabled ? (
          showDisable ? (
            <form onSubmit={disable} className="space-y-3">
              <p className="text-sm text-muted-foreground">Enter a current code to turn off 2FA.</p>
              <Input
                {...codeInputProps}
                value={disableCode}
                onChange={(e) => setDisableCode(onlyDigits(e.target.value))}
                autoFocus
                required
              />
              <div className="flex gap-2">
                <Button type="submit" variant="brand" disabled={twoBusy || disableCode.length !== 6} className="border-destructive bg-destructive text-white hover:bg-destructive">
                  {twoBusy ? 'Disabling…' : 'Disable 2FA'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setShowDisable(false); setDisableCode(''); setTwoErr(''); }}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" onClick={() => { setShowDisable(true); setTwoErr(''); }} className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white">
              <ShieldOff className="h-4 w-4" /> Disable 2FA
            </Button>
          )
        ) : setup ? (
          <form onSubmit={enable} className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background/40 p-4">
              <img src={setup.qrDataUrl} alt="2FA QR code" className="h-44 w-44 rounded-lg" />
              <p className="text-center text-xs text-muted-foreground">
                Scan with your authenticator app, or enter this key manually:
              </p>
              <code className="select-all break-all rounded bg-muted px-2 py-1 text-xs">{setup.secret}</code>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Enter the 6-digit code to confirm</label>
              <Input
                {...codeInputProps}
                value={code}
                onChange={(e) => setCode(onlyDigits(e.target.value))}
                autoFocus
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="brand" disabled={twoBusy || code.length !== 6}>
                {twoBusy ? 'Verifying…' : 'Enable 2FA'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setSetup(null); setCode(''); setTwoErr(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="brand" onClick={startSetup} disabled={twoBusy}>
            {twoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Enable 2FA
          </Button>
        )}
      </div>
    </div>
  );
};
