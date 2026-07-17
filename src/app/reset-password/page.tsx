'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import TurnstileWidget, { TURNSTILE_ENABLED, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

export default function ResetPassword() {
  usePageTitle('Reset Password');
  const router = useRouter();

  // 'checking' while we detect whether a recovery session is active
  const [mode, setMode] = useState<'checking' | 'request' | 'update'>('checking');

  // ── Request-reset form state ────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const resetCaptcha = () => { turnstileRef.current?.reset(); setCaptchaToken(''); };

  // ── Update-password form state ──────────────────────────────────────────────
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateErrors, setUpdateErrors] = useState<{ password?: string; confirm?: string }>({});
  const [updateError, setUpdateError] = useState('');
  const [success, setSuccess] = useState(false);

  // Detect recovery session on mount. If the user already has a session
  // (set by /auth/callback after exchanging the recovery code), show the
  // "set new password" form immediately without another login step.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setMode(session?.user ? 'update' : 'request');
    });
  }, []);

  // Cooldown ticker for the resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRequestReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setRequestError('');
    setFieldError('');

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setFieldError(result.error.issues[0].message);
      return;
    }

    setSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?source=recovery`,
      captchaToken: captchaToken || undefined,
    });
    setSending(false);

    // Captcha tokens are single-use — reset after every attempt so a resend
    // requires a fresh challenge.
    resetCaptcha();

    if (resetError) {
      setRequestError('Something went wrong. Please try again.');
      return;
    }

    setSent(true);
    setCooldown(60);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateErrors({});
    setUpdateError('');

    const result = passwordSchema.safeParse({ password, confirm });
    if (!result.success) {
      const fieldErrors: typeof updateErrors = {};
      result.error.issues.forEach((err) => {
        if (err.path[0] === 'password') fieldErrors.password = err.message;
        if (err.path[0] === 'confirm') fieldErrors.confirm = err.message;
      });
      setUpdateErrors(fieldErrors);
      return;
    }

    setUpdating(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setUpdating(false);

    if (updateError) {
      if (updateError.message.includes('token') || updateError.message.includes('expired')) {
        setUpdateError('Reset link expired. Please request a new one.');
      } else {
        setUpdateError(updateError.message);
      }
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push('/dashboard'), 2000);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (mode === 'checking') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <MarketingPageRoot>
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Link href="/" className="inline-flex flex-col sm:flex-row items-center justify-center gap-2">
              <img src="/logo-dark.svg" alt="704 Collective" height={48} width={48} className="h-12 w-auto" />
            </Link>
          </div>

          <div className="card-elevated p-8 space-y-6">
            {mode === 'update' ? (
              /* ── Set-new-password form ──────────────────────────────────── */
              success ? (
                <div className="text-center space-y-4">
                  <CheckCircle className="w-12 h-12 text-primary mx-auto" />
                  <h1 className="text-xl font-bold text-foreground">Password updated!</h1>
                  <p className="text-sm text-muted-foreground">Redirecting to your dashboard…</p>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <h1 className="text-xl font-semibold text-foreground">Set a new password</h1>
                    <p className="text-sm text-muted-foreground">Choose a strong password for your account.</p>
                  </div>
                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">New Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={updateErrors.password ? 'border-destructive pr-10' : 'pr-10'}
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {updateErrors.password && (
                        <p className="text-xs text-destructive">{updateErrors.password}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm">Confirm Password</Label>
                      <Input
                        id="confirm"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className={updateErrors.confirm ? 'border-destructive' : ''}
                        minLength={8}
                      />
                      {updateErrors.confirm && (
                        <p className="text-xs text-destructive">{updateErrors.confirm}</p>
                      )}
                    </div>
                    {updateError && (
                      <p className="text-sm text-destructive">
                        {updateError}{' '}
                        {updateError.includes('expired') && (
                          <button
                            type="button"
                            onClick={() => setMode('request')}
                            className="underline font-medium"
                          >
                            Request a new link
                          </button>
                        )}
                      </p>
                    )}
                    <Button type="submit" className="w-full" disabled={updating}>
                      {updating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                      ) : (
                        'Update Password'
                      )}
                    </Button>
                  </form>
                </>
              )
            ) : (
              /* ── Request-reset form ─────────────────────────────────────── */
              sent ? (
                <div className="text-center space-y-4">
                  <CheckCircle className="w-12 h-12 text-primary mx-auto" />
                  <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
                  <p className="text-sm text-muted-foreground">
                    We've sent a password reset link to{' '}
                    <span className="font-medium text-foreground">{email}</span>. It may take a
                    minute to arrive. Check your spam folder if you don't see it.
                  </p>
                  <TurnstileWidget
                    ref={turnstileRef}
                    className="flex justify-center"
                    onSuccess={setCaptchaToken}
                    onExpire={() => setCaptchaToken('')}
                    onError={() => setCaptchaToken('')}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleRequestReset()}
                    disabled={cooldown > 0 || sending || (TURNSTILE_ENABLED && !captchaToken)}
                  >
                    {sending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    ) : cooldown > 0 ? (
                      `Resend available in ${cooldown}s…`
                    ) : (
                      'Resend'
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
                    <p className="text-sm text-muted-foreground">
                      Enter your email and we'll send you a reset link.
                    </p>
                  </div>
                  <form onSubmit={handleRequestReset} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={fieldError ? 'border-destructive' : ''}
                      />
                      {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
                    </div>
                    {requestError && <p className="text-sm text-destructive">{requestError}</p>}
                    <TurnstileWidget
                      ref={turnstileRef}
                      className="flex justify-center"
                      onSuccess={setCaptchaToken}
                      onExpire={() => setCaptchaToken('')}
                      onError={() => setCaptchaToken('')}
                    />
                    <Button type="submit" className="w-full" disabled={sending || (TURNSTILE_ENABLED && !captchaToken)}>
                      {sending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                      ) : (
                        'Send Reset Link'
                      )}
                    </Button>
                  </form>
                </>
              )
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              <ArrowLeft className="w-3 h-3" /> Back to sign in
            </Link>
          </p>
        </div>
      </MarketingPageRoot>
    </div>
  );
}
