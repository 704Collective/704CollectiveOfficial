'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import logo from '@/assets/704-logo.png';

export default function VerifyEmail() {
  usePageTitle('Verify Your Email');
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const emailFromParams = searchParams.get('email') || '';
  const displayEmail = user?.email || emailFromParams;

  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (user?.email_confirmed_at) {
      router.push('/dashboard');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || !displayEmail) return;
    setLoading(true);
    await supabase.auth.resend({ type: 'signup', email: displayEmail });
    setLoading(false);
    setSent(true);
    setCooldown(60);
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

        <div className="card-elevated p-8 space-y-6 text-center">
          <Mail className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We've sent a verification link to{' '}
            {displayEmail ? <span className="font-medium text-foreground">{displayEmail}</span> : 'your email'}.
          </p>

          {sent && <p className="text-sm text-primary font-medium">Verification email sent!</p>}

          <Button variant="outline" className="w-full" onClick={handleResend} disabled={cooldown > 0 || loading || !displayEmail}>
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : cooldown > 0 ? (
              `Resend available in ${cooldown}s...`
            ) : (
              'Resend verification email'
            )}
          </Button>
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
