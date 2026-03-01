'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { z } from 'zod';
import logo from '@/assets/704-logo.png';

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: "Passwords don't match", path: ['confirm'] });

export default function SetupPassword() {
  usePageTitle('Set Up Your Account');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  // Resend state
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState('');

  // Wait for Supabase to exchange the recovery token from the URL hash
  useEffect(() => {
    let resolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        resolved = true;
        setReady(true);
      }
    });

    // Also check if we already have a session (e.g. page reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolved = true;
        setReady(true);
      }
    });

    // Check URL for error params (Supabase redirects with error in hash on expired links)
    const hash = window.location.hash;
    if (hash.includes('error=') || hash.includes('error_description=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const errorDesc = params.get('error_description') || params.get('error') || '';
      if (errorDesc.toLowerCase().includes('expired') || errorDesc.toLowerCase().includes('invalid')) {
        setLinkExpired(true);
        return;
      }
    }

    // Timeout: if nothing resolves in 8 seconds, assume the link is expired/invalid
    const timeout = setTimeout(() => {
      if (!resolved) {
        setLinkExpired(true);
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError('');
    const email = resendEmail.trim().toLowerCase();
    if (!email) {
      setResendError('Please enter your email address.');
      return;
    }
    setResendLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/setup-password`,
    });
    setResendLoading(false);
    if (error) {
      setResendError(error.message);
    } else {
      setResendSent(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError('');

    const result = passwordSchema.safeParse({ password, confirm });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.errors.forEach(err => {
        if (err.path[0] === 'password') fieldErrors.password = err.message;
        if (err.path[0] === 'confirm') fieldErrors.confirm = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex flex-col sm:flex-row items-center justify-center gap-2">
            <img src={logo} alt="704 Collective" className="h-12 w-auto" />
            <span className="text-foreground text-2xl font-medium">Social</span>
          </Link>
        </div>

        <div className="card-elevated p-8 space-y-6">
          {linkExpired ? (
            <div className="text-center space-y-4 py-4">
              <p className="text-xl font-semibold text-foreground">Setup Link Expired</p>
              <p className="text-sm text-muted-foreground">
                This setup link has expired or is no longer valid. Enter your email below to receive a new one.
              </p>

              {resendSent ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <p className="text-sm text-foreground font-medium">New link sent!</p>
                  <p className="text-xs text-muted-foreground">Check your inbox for a fresh setup link.</p>
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-3 text-left pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="resend-email">Email Address</Label>
                    <Input
                      id="resend-email"
                      type="email"
                      placeholder="you@example.com"
                      value={resendEmail}
                      onChange={e => setResendEmail(e.target.value)}
                    />
                  </div>
                  {resendError && <p className="text-xs text-destructive">{resendError}</p>}
                  <Button type="submit" className="w-full" disabled={resendLoading}>
                    {resendLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send New Setup Link'}
                  </Button>
                </form>
              )}

              <Link href="/login">
                <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground">
                  Go to Login
                </Button>
              </Link>
            </div>
          ) : !ready ? (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Verifying your setup link...</p>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-foreground">Welcome to 704 Collective!</h1>
                <p className="text-sm text-muted-foreground">Your membership has been transferred. Set a password to access your account.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className={errors.confirm ? 'border-destructive' : ''}
                  />
                  {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
                </div>
                {error && (
                  <p className="text-sm text-destructive">
                    {error}{' '}
                    <Link href="/reset-password" className="underline font-medium">Request a new setup link</Link>
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</> : 'Set Password & Continue'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
