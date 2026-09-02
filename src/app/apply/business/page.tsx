'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { sendBusinessApplicationSubmittedEmails } from '@/app/actions/transactionalEmails';
import { toast } from 'sonner';
import { Loader2, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  REFERRAL_QUESTION,
  checkOneSource,
  hasReferrerName,
} from '@/lib/referralRules';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Step = 'apply' | 'confirm' | 'payment' | 'done';

interface FormData {
  // Contact details, prefilled from the account
  firstName: string;
  lastName: string;
  phone: string;
  // Application
  company: string;
  title: string;
  industry: string;
  linkedinUrl: string;
  website: string;
  yearsInCharlotte: string;
  referralSource: string;
  referrerName: string;
  conflictLesson: string;
  missingInCharlotte: string;
  oneYearGoal: string;
  rightIntro: string;
  recentWins: string;
  anythingElse: string;
}

const INITIAL_FORM: FormData = {
  firstName: '', lastName: '', phone: '',
  company: '', title: '', industry: '', linkedinUrl: '', website: '',
  yearsInCharlotte: '', referralSource: '', referrerName: '', conflictLesson: '',
  missingInCharlotte: '', oneYearGoal: '', rightIntro: '',
  recentWins: '', anythingElse: '',
};

// Inner Stripe form rendered inside <Elements> provider
function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/apply/business?payment=saved`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message || 'Failed to save payment method');
      setSubmitting(false);
      return;
    }

    // Stripe accepted the card in the browser, but the record of it is only
    // trustworthy once the server has verified the SetupIntent itself.
    try {
      const res = await fetch('/api/business-application-payment', { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { card_saved?: boolean }).card_saved !== true) {
        setErrorMessage(
          'Your card was saved with Stripe but we could not record it on your application. Please try again, or email hello@704collective.com.',
        );
        setSubmitting(false);
        return;
      }
    } catch {
      setErrorMessage(
        'Your card was saved with Stripe but we could not record it on your application. Please try again, or email hello@704collective.com.',
      );
      setSubmitting(false);
      return;
    }

    onSuccess();
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {errorMessage && (
        <p className="text-sm text-red-400">{errorMessage}</p>
      )}
      <Button type="submit" className="w-full" disabled={!stripe || submitting}>
        {submitting ? 'Saving...' : 'Save Payment Method'}
      </Button>
    </form>
  );
}

/** Shell used by every non-form state so they share the page chrome. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ backgroundColor: '#1A1A1A', paddingTop: 'calc(64px + var(--banner-height, 0px))' }}>
      <Nav />
      <MarketingPageRoot>
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          {children}
        </div>
      </MarketingPageRoot>
    </div>
  );
}

function BusinessApplicationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>('apply');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [accountEmail, setAccountEmail] = useState('');

  // Payment step state
  const [paymentCheckLoading, setPaymentCheckLoading] = useState(false);
  const [hasExistingPayment, setHasExistingPayment] = useState<boolean | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null);

  // Referral code state
  const [referralCode, setReferralCode] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [resolvedAmbassador, setResolvedAmbassador] = useState<{ id: string; full_name: string } | null>(null);
  const [referralCodeError, setReferralCodeError] = useState<string | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [referralRuleError, setReferralRuleError] = useState<string | null>(null);

  const emailConfirmed = !!user?.email_confirmed_at;

  const set = (key: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const validateReferralCode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setResolvedAmbassador(null);
      setReferralCodeError(null);
      setReferralCode('');
      return;
    }
    setValidatingCode(true);
    setReferralCodeError(null);
    const { data, error } = await supabase.rpc('get_ambassador_by_code', {
      p_code: trimmed,
    });
    setValidatingCode(false);
    if (error || !data || (data as unknown[]).length === 0) {
      setResolvedAmbassador(null);
      setReferralCode('');
      setReferralCodeError('Invalid or inactive code');
      return;
    }
    const ambassador = (data as { id: string; full_name: string }[])[0];
    setResolvedAmbassador({ id: ambassador.id, full_name: ambassador.full_name });
    setReferralCode(trimmed);
    setReferralCodeError(null);
  }, []);

  // Pre-fill referral code from ?ref= URL param
  useEffect(() => {
    const refFromUrl = searchParams.get('ref')?.trim();
    if (!refFromUrl) return;
    setReferralCodeInput(refFromUrl.toUpperCase());
    void validateReferralCode(refFromUrl);
  }, [searchParams, validateReferralCode]);

  // Prefill contact details from the account. The application is account-first,
  // so there is always a profile to read by the time the form renders.
  useEffect(() => {
    if (authLoading || !user) return;

    async function prefillFromProfile() {
      setAccountEmail(user!.email ?? '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', user!.id)
        .maybeSingle();

      if (profile) {
        const nameParts = (profile.full_name ?? '').trim().split(/\s+/).filter(Boolean);
        setForm(prev => ({
          ...prev,
          firstName: nameParts[0] ?? '',
          lastName: nameParts.slice(1).join(' '),
          phone: profile.phone ?? '',
        }));
        setAccountEmail(profile.email ?? user!.email ?? '');
      }
    }

    prefillFromProfile();
  }, [authLoading, user]);

  // Deep link from the dashboard's "add your card" action. Guarded on a real
  // session so the payment step is unreachable without one.
  useEffect(() => {
    if (authLoading || !user) return;
    if (searchParams.get('step') !== 'payment') return;
    setStep('payment');
  }, [authLoading, user, searchParams]);

  // On entering the payment step: check for existing payment method,
  // then create a SetupIntent if needed.
  useEffect(() => {
    if (step !== 'payment') return;
    if (hasExistingPayment !== null) return;

    let cancelled = false;

    (async () => {
      setPaymentCheckLoading(true);
      setPaymentInitError(null);

      try {
        const checkRes = await fetch('/api/business-application-payment', {
          method: 'GET',
        });

        if (!checkRes.ok) throw new Error('Failed to check payment status');

        const checkData = await checkRes.json();

        if (cancelled) return;

        if (checkData.hasPaymentMethod) {
          setHasExistingPayment(true);
          setPaymentCheckLoading(false);
          setTimeout(() => {
            if (!cancelled) setStep('done');
          }, 1500);
          return;
        }

        setHasExistingPayment(false);

        const intentRes = await fetch('/api/business-application-payment', {
          method: 'POST',
        });

        if (!intentRes.ok) {
          const errData = await intentRes.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || 'Failed to initialize payment');
        }

        const { clientSecret: cs } = await intentRes.json() as { clientSecret: string };

        if (cancelled) return;

        setClientSecret(cs);
        setPaymentCheckLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Payment init failed:', err);
        setPaymentInitError(msg);
        setPaymentCheckLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredApplicationFields = [
      'company', 'title', 'industry', 'yearsInCharlotte',
      'referralSource', 'referrerName', 'conflictLesson', 'missingInCharlotte',
      'oneYearGoal', 'rightIntro', 'recentWins',
    ] as (keyof FormData)[];

    for (const field of requiredApplicationFields) {
      if (!form[field]?.toString().trim()) {
        toast.error('Please fill out all required application fields');
        return;
      }
    }

    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Please provide your first and last name');
      return;
    }

    // One-source rule, browser side. The route enforces it again server-side.
    const oneSourceError = checkOneSource(referralCode, form.referrerName);
    if (oneSourceError) {
      setReferralRuleError(oneSourceError);
      toast.error(oneSourceError);
      return;
    }
    setReferralRuleError(null);

    setLoading(true);

    try {
      const res = await fetch('/api/business-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          company: form.company.trim(),
          title: form.title.trim(),
          industry: form.industry.trim(),
          linkedinUrl: form.linkedinUrl.trim(),
          website: form.website.trim(),
          yearsInCharlotte: form.yearsInCharlotte.trim(),
          referralSource: form.referralSource.trim(),
          conflictLesson: form.conflictLesson.trim(),
          missingInCharlotte: form.missingInCharlotte.trim(),
          oneYearGoal: form.oneYearGoal.trim(),
          rightIntro: form.rightIntro.trim(),
          recentWins: form.recentWins.trim(),
          anythingElse: form.anythingElse.trim(),
          referralCode: referralCode || '',
          referrerName: form.referrerName.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = (data as { error?: string }).error ?? 'Submission failed. Please try again.';
        setReferralRuleError(message);
        toast.error(message);
        setLoading(false);
        return;
      }

      // Confirmation emails (non-blocking)
      try {
        await sendBusinessApplicationSubmittedEmails({
          applicantEmail: accountEmail.trim().toLowerCase(),
          applicantFirstName: form.firstName.trim(),
          company: form.company.trim(),
          adminPanelUrl: `${window.location.origin}/admin?section=applications`,
        });
      } catch (emailErr) {
        console.error('Application confirmation email failed:', emailErr);
      }

      setStep('payment');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Application submit failed:', err);
      toast.error(`Submission failed: ${errorMessage}. Please try again or contact support.`);
    } finally {
      setLoading(false);
    }
  };

  // ── Auth still resolving ─────────────────────────────────────────────────
  if (authLoading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center space-y-4 py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </PageShell>
    );
  }

  // ── Account-first lock ───────────────────────────────────────────────────
  // The application does not exist for a logged-out visitor. No fields, no
  // captcha, no signup embedded in the form: an account comes first.
  if (!user) {
    return (
      <PageShell>
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Create your account to apply
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The 704 Business application is only available to signed-in members with a
              confirmed email address. It takes a minute, and you will not be charged
              anything to apply.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => router.push('/signup?redirect=/apply/business')}
            >
              Create an account
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/login?redirect=/apply/business')}
            >
              I already have an account
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Questions? Email us at{' '}
            <a href="mailto:hello@704collective.com" className="text-primary hover:underline">
              hello@704collective.com
            </a>.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Unconfirmed email state ──────────────────────────────────────────────
  // Signed in but the address has never been verified. Same screen the R3 flow
  // has always used, now reached from the account-first gate.
  if (!emailConfirmed) {
    return (
      <PageShell>
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Confirm your email to continue
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a confirmation link to{' '}
              <span className="text-foreground font-medium">{user.email}</span>.
              Click it to unlock the application.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 text-left space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What happens next
            </p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary shrink-0">1.</span>
                Confirm your email using the link we just sent.
              </li>
              <li className="flex gap-2">
                <span className="text-primary shrink-0">2.</span>
                Come back here and complete your application.
              </li>
              <li className="flex gap-2">
                <span className="text-primary shrink-0">3.</span>
                Add a payment method, then we review, usually within 48 hours.
              </li>
            </ol>
            <p className="text-sm text-muted-foreground leading-relaxed pt-1">
              <strong className="text-foreground">You will not be charged</strong> unless your
              application is approved.
            </p>
          </div>

          <div className="space-y-3">
            <Button className="w-full" onClick={() => window.location.reload()}>
              I&apos;ve confirmed my email
            </Button>
            <p className="text-xs text-muted-foreground">
              Can&apos;t find the email? Check your spam folder, or email us at{' '}
              <a href="mailto:hello@704collective.com" className="text-primary hover:underline">
                hello@704collective.com
              </a>.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Post-submit confirm screen ───────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <PageShell>
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Confirm your email to finish
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your application is in. We sent a confirmation link to{' '}
              <span className="text-foreground font-medium">{accountEmail}</span>.
              Click it to activate your account.
            </p>
          </div>
          <Button className="w-full" onClick={() => router.push('/login')}>
            Go to sign in
          </Button>
        </div>
      </PageShell>
    );
  }

  // ── Payment step ─────────────────────────────────────────────────────────
  if (step === 'payment') {
    return (
      <PageShell>
        <div className="w-full max-w-md space-y-6">

          {/* Loading */}
          {paymentCheckLoading && (
            <div className="flex flex-col items-center space-y-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Setting up payment...</p>
            </div>
          )}

          {/* Error */}
          {!paymentCheckLoading && paymentInitError && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-400">{paymentInitError}</p>
              <Button
                className="w-full"
                onClick={() => {
                  setHasExistingPayment(null);
                  setClientSecret(null);
                  setPaymentInitError(null);
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {/* Existing payment method detected - transitioning */}
          {!paymentCheckLoading && hasExistingPayment === true && (
            <div className="flex flex-col items-center space-y-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                Payment method on file - finalizing your application...
              </p>
            </div>
          )}

          {/* No existing payment method - show Stripe Elements */}
          {!paymentCheckLoading && hasExistingPayment === false && clientSecret && (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  Application Pending - Save Payment Method to Submit
                </h1>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                <p>
                  Your application has been submitted for review. To finalize your spot,
                  please save a payment method below.
                </p>
                <p>
                  <strong className="text-foreground">Important:</strong> You will NOT be
                  charged unless your application is approved by our team. If your application
                  is denied, you will be provided a reason and you will NOT be charged.
                </p>
                <p>
                  Please continuously check your email or member portal for an update, or email
                  our team at{' '}
                  <a href="mailto:hello@704collective.com" className="text-primary hover:underline">
                    hello@704collective.com
                  </a>{' '}
                  if you have any questions.
                </p>
              </div>
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#C6A664',
                      colorBackground: '#1A1A1A',
                      colorText: '#FAF6F0',
                    },
                  },
                }}
              >
                <PaymentForm onSuccess={() => setStep('done')} />
              </Elements>
            </>
          )}

        </div>
      </PageShell>
    );
  }

  // ── Done screen ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <PageShell>
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">You&apos;re All Set!</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your application has been submitted and your payment method is on file. You&apos;ll
              receive an email when our team reviews your application - usually within 2-3 business
              days. If approved, your card will be charged the monthly rate at that time.
            </p>
          </div>
          <Button className="w-full" onClick={() => router.push('/dashboard')}>
            Go to your portal
          </Button>
        </div>
      </PageShell>
    );
  }

  // ── Apply form (unlocked: signed in and confirmed) ───────────────────────
  const codeApplied = !!resolvedAmbassador;
  const nameGiven = hasReferrerName(form.referrerName);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1A1A1A', paddingTop: 'calc(64px + var(--banner-height, 0px))' }}>
      <Nav />
      <MarketingPageRoot>
      <div className="flex-1 px-4 py-12">
        <div className="w-full max-w-xl mx-auto space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">704 Business Application</p>
            <h1 className="text-2xl font-semibold text-foreground mb-1">Apply for membership</h1>
            <p className="text-sm text-muted-foreground">All fields are required unless marked optional.</p>
          </div>

          <form onSubmit={handleApply} className="space-y-8">

            {/* Contact details, prefilled from the signed-in account */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Details</p>

              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-xs text-muted-foreground">Applying as</p>
                <p className="text-sm font-medium text-foreground">{accountEmail}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input id="firstName" placeholder="First name" value={form.firstName} onChange={set('firstName')} required autoComplete="given-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input id="lastName" placeholder="Last name" value={form.lastName} onChange={set('lastName')} required autoComplete="family-name" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" placeholder="704-555-0100" value={form.phone} onChange={set('phone')} autoComplete="tel" />
              </div>
            </div>

            {/* Referral: one source only */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Referral</p>

              {codeApplied ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 space-y-0.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Referred By</p>
                  <p className="text-base font-semibold text-primary">{resolvedAmbassador.full_name}</p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground pt-1"
                    onClick={() => {
                      setResolvedAmbassador(null);
                      setReferralCode('');
                      setReferralCodeInput('');
                      setReferralRuleError(null);
                    }}
                  >
                    Remove code
                  </button>
                </div>
              ) : (
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                    Have a referral code?
                  </summary>
                  <div className="mt-2.5 flex gap-2">
                    <Input
                      type="text"
                      placeholder="Enter code"
                      value={referralCodeInput}
                      onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                      onBlur={(e) => void validateReferralCode(e.target.value)}
                      className="uppercase"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void validateReferralCode(referralCodeInput)}
                      disabled={validatingCode}
                      className="shrink-0"
                    >
                      {validatingCode ? 'Checking...' : 'Apply'}
                    </Button>
                  </div>
                  {referralCodeError && (
                    <p className="text-xs text-red-400 mt-1.5">{referralCodeError}</p>
                  )}
                </details>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="referrerName">{REFERRAL_QUESTION} *</Label>
                <Input
                  id="referrerName"
                  placeholder="Jane Smith, or N/A"
                  value={form.referrerName}
                  onChange={(e) => { set('referrerName')(e); setReferralRuleError(null); }}
                  required
                />
                {codeApplied && (
                  <p className="text-xs text-muted-foreground">
                    You applied an ambassador code, so this answer must be N/A. A referral can
                    only come from one source.
                  </p>
                )}
                {codeApplied && nameGiven && (
                  <p className="text-xs text-red-400">
                    A referral can only come from one source. Remove the code, or change this
                    answer to N/A.
                  </p>
                )}
              </div>

              {referralRuleError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <p className="text-sm text-red-400">{referralRuleError}</p>
                </div>
              )}
            </div>

            {/* Professional info */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Professional Info</p>

              <div className="space-y-1.5">
                <Label>Company *</Label>
                <Input placeholder="Acme Corp" value={form.company} onChange={set('company')} required />
              </div>
              <div className="space-y-1.5">
                <Label>Title / Role *</Label>
                <Input placeholder="CEO, Founder, VP of Marketing..." value={form.title} onChange={set('title')} required />
              </div>
              <div className="space-y-1.5">
                <Label>Industry *</Label>
                <Input placeholder="Real estate, Tech, Finance..." value={form.industry} onChange={set('industry')} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>LinkedIn URL <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder="linkedin.com/in/..." value={form.linkedinUrl} onChange={set('linkedinUrl')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Website <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder="yourcompany.com" value={form.website} onChange={set('website')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Years in Charlotte *</Label>
                <Input type="number" min="0" max="100" placeholder="3" value={form.yearsInCharlotte} onChange={set('yearsInCharlotte')} required />
              </div>
              <div className="space-y-1.5">
                <Label>How did you hear about 704 Collective? *</Label>
                <Input placeholder="Friend, Instagram, CLTBucketlist..." value={form.referralSource} onChange={set('referralSource')} required />
              </div>
            </div>

            {/* Application questions */}
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Application Questions</p>

              {[
                {
                  key: 'conflictLesson' as keyof FormData,
                  label: "Describe a recent conflict or issue you've had (personal or business) and what you learned from solving it. *",
                  placeholder: "Be honest - this tells us more about you than any résumé.",
                },
                {
                  key: 'missingInCharlotte' as keyof FormData,
                  label: 'What do you think is missing in Charlotte? *',
                  placeholder: 'What gap do you see that nobody is filling?',
                },
                {
                  key: 'oneYearGoal' as keyof FormData,
                  label: "One year from now, what do you expect to have gotten out of joining 704 Collective's Business Membership? *",
                  placeholder: 'Be specific - what does success look like for you?',
                },
                {
                  key: 'rightIntro' as keyof FormData,
                  label: 'What are you working on right now that you think the right introduction or solution could fix? *',
                  placeholder: "A challenge, a bottleneck, a door you're trying to open...",
                },
                {
                  key: 'recentWins' as keyof FormData,
                  label: "Describe a few wins you've had recently with your business. *",
                  placeholder: 'Could be revenue milestones, new partnerships, product launches...',
                },
                {
                  key: 'anythingElse' as keyof FormData,
                  label: 'Anything else we should know about you, your business, your lifestyle?',
                  placeholder: "This is your space - say whatever didn't fit above.",
                  optional: true,
                },
              ].map(q => (
                <div key={q.key} className="space-y-1.5">
                  <Label>{q.label}</Label>
                  <Textarea
                    placeholder={q.placeholder}
                    value={form[q.key]}
                    onChange={set(q.key)}
                    required={!q.optional}
                    rows={4}
                    className="resize-none"
                  />
                </div>
              ))}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || (codeApplied && nameGiven)}
              size="lg"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                : 'Submit Application'
              }
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              We review every application personally and respond within 48 hours.
            </p>
          </form>
        </div>
      </div>
      </MarketingPageRoot>
    </div>
  );
}

export default function BusinessApplicationPage() {
  return (
    <Suspense>
      <BusinessApplicationInner />
    </Suspense>
  );
}
