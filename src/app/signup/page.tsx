'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { sendSocialSignupConfirmationEmail } from '@/app/actions/transactionalEmails';
import { toast } from 'sonner';
import { Loader2, Crown, Ticket, X } from 'lucide-react';

type Step = 'form' | 'verify' | 'choice';

export default function SignupPage() {
  usePageTitle('Sign Up | 704 Collective');
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPartnerBanner, setShowPartnerBanner] = useState(true);

  // ── Step 1: Create account ──────────────────────────────────────
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      toast.error('Please fill out all fields');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      // Check if this email or name is banned before creating an account
      const normalizedEmail = email.trim().toLowerCase();
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      const { data: bannedByEmail } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('is_banned', true)
        .maybeSingle();

      const { data: bannedByName } = await supabase
        .from('profiles')
        .select('id')
        .eq('full_name', fullName)
        .eq('is_banned', true)
        .maybeSingle();

      if (bannedByEmail || bannedByName) {
        toast.error('This email address is not eligible to create an account. Please contact hello@704collective.com.');
        setLoading(false);
        return;
      }

      // Sign up with Supabase auth
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: `${firstName.trim()} ${lastName.trim()}`,
            phone: phone.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?source=signup`,
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          toast.error('An account with this email already exists. Try logging in.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Update profile with member info
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: email.trim().toLowerCase(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone.trim(),
          member_type: 'social_non_member',
          subscription_status: 'inactive',
        });
        void sendSocialSignupConfirmationEmail();
      }

      setStep('verify');
    } catch (err) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: After email verified, show choice ───────────────────
  // This is shown after user clicks the email link and comes back
  // For the signup flow we show verify screen, then choice on next visit
  // But we also show choice directly if they are already verified

  const handlePayNow = () => {
    router.push('/join/checkout');
  };

  const handlePayLater = async () => {
    setLoading(true);
    try {
      // Sign in to make sure session is active
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // ── Verify screen ───────────────────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Nav />
        <MarketingPageRoot>
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">Check your email</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
                Click the link to verify your account, then come back here to complete your signup.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Didn't get it? Check your spam folder or{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={async () => {
                  await supabase.auth.resend({ type: 'signup', email });
                  toast.success('Confirmation email resent');
                }}
              >
                resend the email
              </button>
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setStep('choice')}
            >
              I've verified my email — continue
            </Button>
          </div>
        </div>
        </MarketingPageRoot>
      </div>
    );
  }

  // ── Choice screen ───────────────────────────────────────────────
  if (step === 'choice') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Nav />
        <MarketingPageRoot>
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Welcome, {firstName}!
              </h1>
              <p className="text-muted-foreground text-sm">
                Your account is ready. How would you like to proceed?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pay now */}
              <button
                type="button"
                onClick={handlePayNow}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                  <Crown className="w-6 h-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground mb-1">Join Now — $30/mo</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Unlock free RSVPs, guest passes, member-only events, and full community access.
                  </p>
                </div>
                <span className="text-xs font-medium text-primary">Get instant access →</span>
              </button>

              {/* Pay later */}
              <button
                type="button"
                onClick={handlePayLater}
                disabled={loading}
                className="group flex flex-col items-center gap-4 p-6 rounded-xl border-2 border-border hover:border-border/80 bg-card hover:bg-accent/30 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                  <Ticket className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground mb-1">Browse for Now</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    You can view events and buy tickets, but won't have free RSVPs or member-only access until you subscribe.
                  </p>
                </div>
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  : <span className="text-xs text-muted-foreground">Continue without paying →</span>
                }
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground px-4">
              Not a member? You can still browse and buy tickets to public events.
              Member benefits include free RSVPs, +1 guest passes, member-only events,
              wellness days, and full community access.
            </p>
          </div>
        </div>
        </MarketingPageRoot>
      </div>
    );
  }

  // ── Step 1: Signup form ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showPartnerBanner && (
        <div className="relative z-[60] border-b border-amber-200/50 bg-[#F3E9D2] text-[#3d3426] px-4 py-3 pr-12 text-center text-sm leading-snug">
          <p>
            Trying to join as a partner instead of a member? You&apos;re on the wrong page!{' '}
            <Link href="/partners" className="font-semibold text-[#8B6914] underline underline-offset-2 hover:text-[#6b5010]">
              Click here to join as a partner
            </Link>
          </p>
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={() => setShowPartnerBanner(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-black/5 text-[#5c4f3a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <Nav />
      <MarketingPageRoot>
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground mb-2">Create your account</h1>
            <p className="text-muted-foreground text-sm">
              Join 704 Collective — Charlotte's members-only community.
            </p>
          </div>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  placeholder="First name"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  placeholder="Last name"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="704-555-0100"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>
                : 'Create Account'
              }
            </Button>
          </form>

          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Already have an account?{' '}
              <a href="/login" className="text-primary hover:underline">Sign in</a>
            </p>
            <p className="text-xs text-muted-foreground">
              Interested in Business membership?{' '}
              <a href="/business#apply" className="text-primary hover:underline">Apply here</a>
            </p>
          </div>
        </div>
      </div>
      </MarketingPageRoot>
    </div>
  );
}