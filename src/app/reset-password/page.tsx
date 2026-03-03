'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import logo from '@/assets/704-logo.png';

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export default function ResetPassword() {
  usePageTitle('Reset Password');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setFieldError('');

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setFieldError(result.error.issues[0].message);
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);
    if (resetError) {
      setError('Something went wrong. Please try again.');
      return;
    }

    setSent(true);
    setCooldown(60);
  };

  const handleResend = () => {
    if (cooldown > 0) return;
    handleSubmit();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex flex-col sm:flex-row items-center justify-center gap-2">
            <img src={logo.src}
 alt="704 Collective" className="h-12 w-auto" />
            <span className="text-foreground text-2xl font-medium">Social</span>
          </Link>
        </div>

        <div className="card-elevated p-8 space-y-6">
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-primary mx-auto" />
              <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                We've sent a password reset link to <span className="font-medium text-foreground">{email}</span>. It may take a minute to arrive. Check your spam folder if you don't see it.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                ) : cooldown > 0 ? (
                  `Resend available in ${cooldown}s...`
                ) : (
                  'Resend'
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
                <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Reset Link'}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
            <ArrowLeft className="w-3 h-3" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
