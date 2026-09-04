'use client';

import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import TurnstileWidget, { TURNSTILE_ENABLED, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';
import { addDays, format } from 'date-fns';
import { Calendar, MapPin, Users, ArrowRight, Loader2 } from 'lucide-react';
import { SOCIAL_TIER, BUSINESS_TIER, FLASH_SALE } from '@/lib/pricing';
import {
  promoQuoteView,
  type PromoDuration,
  type PromoQuotePayload,
  type PromoQuoteView,
} from '@/lib/promoQuote';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  FadeUp,
  StaggerContainer,
  StaggerItem,
} from '@/components/Animations';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { PromoCodeField } from '@/components/PromoCodeField';

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location_name: string | null;
  image_url: string | null;
  capacity: number | null;
  is_members_only: boolean | null;
  ticket_price: number | null;
}

const benefits = [
  '10+ curated events every month',
  'Priority RSVP access (events fill up fast)',
  'Co-ed community of people like you',
  'Happy hours, game nights, adventures & more',
  'Friends, not just drinking buddies',
  'Digital membership card',
  'Member-only events & experiences',
  'Cancel anytime - no contracts',
];

const GOAL_OPTIONS = [
  { label: 'Connections and referrals', value: 'connections_referrals' },
  { label: 'Events and experiences',   value: 'events_experiences'    },
  { label: 'Community and friendships', value: 'community_friendships' },
  { label: 'Growing my network',        value: 'growing_network'       },
];

const INVALID_PROMO_MESSAGE = "That code isn't valid or has expired";

type QuoteOutcome =
  | { status: 'valid'; view: PromoQuoteView }
  | { status: 'invalid' }
  | { status: 'degraded' };

type QuoteRead = QuoteOutcome | { status: 'empty' };

async function fetchPromoQuoteOnce(code: string): Promise<QuoteRead> {
  const res = await fetch('/api/promo-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    cache: 'no-store',
  });
  if (res.status >= 500) return { status: 'degraded' };
  const text = await res.text();
  if (!text) return { status: 'empty' };
  let body: PromoQuotePayload;
  try {
    body = JSON.parse(text) as PromoQuotePayload;
  } catch {
    return { status: 'empty' };
  }
  if (!body?.valid) return { status: 'invalid' };
  const duration = body.duration as PromoDuration | null | undefined;
  if (!duration) return { status: 'degraded' };
  return {
    status: 'valid',
    view: promoQuoteView(
      body.percent_off ?? null,
      body.amount_off ?? null,
      duration,
      body.duration_in_months ?? null,
    ),
  };
}

async function fetchPromoQuote(code: string): Promise<QuoteOutcome> {
  try {
    const first = await fetchPromoQuoteOnce(code);
    if (first.status === 'valid' || first.status === 'invalid' || first.status === 'degraded') {
      return first;
    }
    const second = await fetchPromoQuoteOnce(code);
    if (second.status === 'valid' || second.status === 'invalid' || second.status === 'degraded') {
      return second;
    }
    return { status: 'invalid' };
  } catch {
    return { status: 'degraded' };
  }
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function PromoDealLines({ quote }: { quote: PromoQuoteView }) {
  return (
    <>
      <p style={{ fontSize: '2rem', fontWeight: 700, color: '#C6A664', margin: 0 }}>
        <span
          data-testid="promo-price-was"
          style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '1.5rem', marginRight: '0.5rem' }}
        >
          {SOCIAL_TIER.monthlyPrice}
        </span>
        <span data-testid="promo-price-now">{quote.displayPrice}</span>
        <span
          data-testid="promo-price-terms"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: '#C6A664', marginLeft: '0.5rem' }}
        >
          {quote.durationLine}
        </span>
      </p>
      {quote.thenPriceLine ? (
        <p
          data-testid="promo-price-then"
          style={{
            fontSize: '0.75rem',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.45)',
            margin: '4px 0 0',
            lineHeight: 1.5,
          }}
        >
          {quote.thenPriceLine}
        </p>
      ) : null}
    </>
  );
}

function JoinInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');
  const { user, isActiveMember, loading: authLoading } = useAuth();
  usePageTitle("Join 704 Collective - Charlotte's Young Professionals Community");
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Form state
  const [fullName, setFullName]             = useState('');
  const [email, setEmail]                   = useState('');
  const [phone, setPhone]                   = useState('');
  const [goal, setGoal]                     = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [smsConsent, setSmsConsent]         = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [formError, setFormError]           = useState<string | null>(null);
  const [captchaToken, setCaptchaToken]     = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  // Ambassador referral state
  const [referralCode, setReferralCode] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [resolvedAmbassador, setResolvedAmbassador] = useState<{ id: string; full_name: string } | null>(null);
  const [referralCodeError, setReferralCodeError] = useState<string | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);

  // Stripe discount / promotion code (server-attached on create-checkout)
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [promoCodeError, setPromoCodeError] = useState<string | null>(null);
  const [promoQuote, setPromoQuote] = useState<PromoQuoteView | null>(null);
  const [promoQuoting, setPromoQuoting] = useState(false);
  const promoQuoteGen = useRef(0);

  const clearPromo = useCallback(() => {
    promoQuoteGen.current += 1;
    setPromoCodeInput('');
    setAppliedPromoCode('');
    setPromoCodeError(null);
    setPromoQuote(null);
  }, []);

  const handlePromoInputChange = useCallback((next: string) => {
    setPromoCodeInput(next);
    setPromoCodeError(null);
    setPromoQuote(null);
    setAppliedPromoCode((prev) => (prev ? '' : prev));
  }, []);

  const applyPromoWithQuote = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setPromoCodeError('Enter a code');
      return;
    }
    const gen = ++promoQuoteGen.current;
    setPromoQuoting(true);
    setPromoCodeError(null);
    try {
      const outcome = await fetchPromoQuote(trimmed);
      if (gen !== promoQuoteGen.current) return;
      if (outcome.status === 'invalid') {
        setAppliedPromoCode('');
        setPromoQuote(null);
        setPromoCodeError(INVALID_PROMO_MESSAGE);
        setPromoCodeInput(trimmed);
        return;
      }
      setPromoCodeInput(trimmed);
      setAppliedPromoCode(trimmed);
      setPromoQuote(outcome.status === 'valid' ? outcome.view : null);
    } finally {
      if (gen === promoQuoteGen.current) setPromoQuoting(false);
    }
  }, []);

  const handlePromoApply = useCallback((code?: string) => {
    void applyPromoWithQuote((code ?? promoCodeInput).trim());
  }, [applyPromoWithQuote, promoCodeInput]);

  // Tier picker Social card loading state
  const [socialLoading, setSocialLoading] = useState(false);

  // Flash-sale: evaluated client-side only to avoid SSR/hydration mismatch
  const [flashSaleActive, setFlashSaleActive] = useState(false);
  useEffect(() => { setFlashSaleActive(FLASH_SALE.isActive()); }, []);

  // Only redirect away if the user already has an active membership.
  // Non-members, canceled members, and new signups should stay on /join.
  useEffect(() => {
    if (!authLoading && user && isActiveMember) {
      router.push('/dashboard');
    }
  }, [authLoading, user, isActiveMember, router]);

  useEffect(() => {
    async function fetchEvents() {
      const now = new Date();
      const fifteenDaysAhead = addDays(now, 15);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', now.toISOString())
        .lte('start_time', fifteenDaysAhead.toISOString())
        .order('start_time', { ascending: true })
        .limit(6);
      if (!error && data) setEvents(data);
      setEventsLoading(false);
    }
    fetchEvents();
  }, []);

  // Validate an ambassador code against the public RPC. Stable identity so the
  // ?ref= bootstrap effect below has a clean dep list.
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
    const { data, error } = await supabase.rpc('get_ambassador_by_code', { p_code: trimmed });
    setValidatingCode(false);
    if (error || !data || data.length === 0) {
      setResolvedAmbassador(null);
      setReferralCode('');
      setReferralCodeError('Invalid or inactive code');
      return;
    }
    const ambassador = data[0] as { id: string; full_name: string };
    setResolvedAmbassador({ id: ambassador.id, full_name: ambassador.full_name });
    setReferralCode(trimmed);
    setReferralCodeError(null);
    // Referral pricing and Stripe promos are mutually exclusive in the UI.
    setPromoCodeInput('');
    setAppliedPromoCode('');
    setPromoCodeError(null);
    setPromoQuote(null);
  }, []);

  // Pre-fill from ?ref= and auto-validate.
  useEffect(() => {
    const refFromUrl = searchParams.get('ref')?.trim();
    if (!refFromUrl) return;
    setReferralCodeInput(refFromUrl.toUpperCase());
    void validateReferralCode(refFromUrl);
  }, [searchParams, validateReferralCode]);

  // Marketing ?code= — same as typing + Apply. A ref param wins: do not apply.
  const codeFromUrl = searchParams.get('code')?.trim() ?? '';
  const refFromUrl = searchParams.get('ref')?.trim() ?? '';
  const prefillPromoFromUrl = Boolean(codeFromUrl && !refFromUrl);

  useEffect(() => {
    if (!prefillPromoFromUrl) return;
    void applyPromoWithQuote(codeFromUrl.toUpperCase());
  }, [prefillPromoFromUrl, codeFromUrl, applyPromoWithQuote]);

  const isFormValid =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.replace(/\D/g, '').length >= 10 &&
    goal !== '' &&
    password.length >= 8 &&
    password === confirmPassword;

  // Only anonymous visitors create a Supabase account (signUp), which is the
  // only step that needs a captcha token. A logged-in non-member already has an
  // account and goes straight to checkout, so the captcha must not gate them.
  const willSignUp = !user;
  const captchaGateActive = willSignUp && TURNSTILE_ENABLED && !captchaToken;

  const handleSubmit = async () => {
    if (!isFormValid || submitting) return;
    // Block if a referral code was typed but didn't resolve to a valid ambassador
    if (referralCodeInput.trim() !== '' && resolvedAmbassador === null) {
      setFormError('That referral code is invalid. Please correct it or clear it to continue.');
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const cleanPhone = phone.replace(/\D/g, '');
    const consentTimestamp = smsConsent ? new Date().toISOString() : null;
    const consentUserAgent = smsConsent ? navigator.userAgent : null;
    const ambassadorIdToUse = resolvedAmbassador?.id ?? null;
    const referralCodeToUse = referralCode || null;

    // STEP ONE - Create a Supabase account for anonymous visitors so we have a
    // user_id for downstream writes. signUp is the only captcha-gated call; a
    // logged-in non-member already has an account, so skip it (and the captcha).
    let newUserId = user?.id ?? null;
    if (willSignUp) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            sms_consent: smsConsent,
            sms_consent_at: consentTimestamp,
            sms_consent_user_agent: consentUserAgent,
            referral_code: referralCodeToUse,
            ambassador_id: ambassadorIdToUse,
            phone: cleanPhone,
            primary_goal: goal,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          captchaToken: captchaToken || undefined,
        },
      });
      if (signUpError && signUpError.message !== 'User already registered') {
        setFormError(signUpError.message);
        turnstileRef.current?.reset();
        setCaptchaToken('');
        setSubmitting(false);
        return;
      }
      // user_id is null for the already-registered case; capture-prospect guards on it.
      // Supabase obfuscation: signUp with an EXISTING email (confirmations on) returns a
      // decoy user whose identities array is empty - treat that as already-registered.
      const isDecoyUser = (signUpData?.user?.identities?.length ?? 0) === 0;
      newUserId = isDecoyUser ? null : (signUpData?.user?.id ?? null);
    }

    // STEP TWO - Persist signup data (blocking - do not proceed to Stripe on failure)
    const { data: captureData, error: captureError } = await supabase.functions.invoke('capture-prospect', {
      body: {
        email: email.trim(),
        full_name: fullName.trim(),
        phone: cleanPhone,
        sms_consent: smsConsent,
        sms_consent_at: consentTimestamp,
        referral_code: referralCodeToUse,
        user_id: newUserId,
        primary_goal: goal,
        ambassador_id: ambassadorIdToUse,
      },
    });
    if (captureError) {
      console.error('[join] capture-prospect failed:', captureError, (captureError as { context?: unknown })?.context);
      setFormError('We could not save your details. Please try again.');
      setSubmitting(false);
      return;
    }
    if ((captureData as { success?: boolean } | null)?.success === false) {
      setFormError('We could not save your details. Please try again.');
      setSubmitting(false);
      return;
    }

    // STEP THREE - Redirect to Stripe checkout
    // Promo is only sent when no ambassador referral is applied (UI enforces this).
    const promoCodeToUse =
      !ambassadorIdToUse && (appliedPromoCode || promoCodeInput).trim()
        ? (appliedPromoCode || promoCodeInput).trim()
        : null;
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          email: email.trim(),
          name: fullName.trim(),
          phone: cleanPhone,
          primary_goal: goal,
          sms_consent: smsConsent,
          referral_code: referralCodeToUse,
          ambassador_id: ambassadorIdToUse,
          ...(promoCodeToUse ? { promoCode: promoCodeToUse } : {}),
        },
      });

      let serverError: string | undefined =
        (data as { error?: string } | null)?.error;
      const ctx = (error as { context?: Response } | null)?.context;
      if (!serverError && ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) serverError = body.error;
        } catch {
          /* ignore parse errors */
        }
      }

      if (serverError === 'invalid_promo_code') {
        setPromoCodeError(INVALID_PROMO_MESSAGE);
        setFormError(null);
        setSubmitting(false);
        return;
      }
      if (error || serverError) {
        throw new Error(serverError || (error instanceof Error ? error.message : 'Checkout failed'));
      }
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setFormError(msg);
      setSubmitting(false);
    }
  };

  // Logged-in non-members bypass the form and go straight to Stripe.
  // Everyone else lands on /join?plan=social to fill in their details first.
  const handleSocialClick = async () => {
    if (user && !isActiveMember) {
      setSocialLoading(true);
      setPromoCodeError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        // The card can show the referral rate, so the checkout call has to carry
        // the claim or the server prices it at the standard rate. create-checkout
        // re-validates the id and the code as a PAIR, so both must travel
        // together exactly as the form's submit path sends them.
        const ambassadorIdToUse = resolvedAmbassador?.id ?? null;
        const referralCodeToUse = referralCode || null;
        // Same rule as the form: referral pricing wins, so a promo is only sent
        // when no ambassador is resolved.
        const promoCodeToUse =
          !resolvedAmbassador && (appliedPromoCode || promoCodeInput).trim()
            ? (appliedPromoCode || promoCodeInput).trim()
            : null;
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {
            email: user.email,
            referral_code: referralCodeToUse,
            ambassador_id: ambassadorIdToUse,
            ...(promoCodeToUse ? { promoCode: promoCodeToUse } : {}),
          },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });

        // create-checkout answers a bad code with a 400 body, which invoke()
        // surfaces on error.context rather than data. Read both, exactly as the
        // form's submit path does, so the bad code lands on the field instead of
        // bouncing the member to the long form.
        let serverError: string | undefined = (data as { error?: string } | null)?.error;
        const ctx = (error as { context?: Response } | null)?.context;
        if (!serverError && ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) serverError = body.error;
          } catch {
            /* ignore parse errors */
          }
        }

        if (serverError === 'invalid_promo_code') {
          setPromoCodeError(INVALID_PROMO_MESSAGE);
          setSocialLoading(false);
          return;
        }

        if (error || serverError) {
          throw new Error(serverError || (error instanceof Error ? error.message : 'Checkout failed'));
        }
        const url = (data as { url?: string })?.url;
        if (!url) throw new Error('No checkout URL returned');
        window.location.href = url;
      } catch {
        router.push('/join?plan=social');
      } finally {
        setSocialLoading(false);
      }
    } else {
      const next = new URLSearchParams();
      next.set('plan', 'social');
      if (prefillPromoFromUrl) next.set('code', codeFromUrl);
      router.push(`/join?${next.toString()}`);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    color: '#FFFFFF',
    fontSize: '0.9375rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '6px',
    letterSpacing: '0.01em',
  };

  return (
    <>
      <Nav />
      <main id="main-content" style={{ paddingTop: 'calc(64px + var(--banner-height, 0px))', backgroundColor: '#000', minHeight: '100dvh' }}>
        <MarketingPageRoot>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px 80px' }}>

          {plan === 'social' ? (
            /* ── Social checkout form ────────────────────────────────────── */
            <FadeUp>
              <section style={{ maxWidth: '460px', margin: '0 auto 64px' }}>
                <p style={{
                  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em',
                  textTransform: 'uppercase', color: '#C6A664', marginBottom: '16px',
                  textAlign: 'center',
                }}>
                  Social Membership
                </p>
                <h1 style={{
                  fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 700, color: '#FFFFFF',
                  letterSpacing: '-0.02em', marginBottom: '8px', lineHeight: 1.15, textAlign: 'center',
                }}>
                  Your people are already here.
                </h1>
                {promoQuote && !resolvedAmbassador ? (
                  <div data-testid="promo-price-block" style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <PromoDealLines quote={promoQuote} />
                    <p style={{
                      fontSize: '1rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6,
                      margin: '12px 0 0',
                    }}>
                      Join Charlotte{"'"}s most curated social club. Cancel anytime.
                    </p>
                  </div>
                ) : (
                  <p style={{
                    fontSize: '1rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6,
                    marginBottom: '32px', textAlign: 'center',
                  }}>
                    Join Charlotte{"'"}s most curated social club for {resolvedAmbassador ? '$35/month' : SOCIAL_TIER.monthlyPriceFull}. Cancel anytime.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Full Name */}
                  <div>
                    <label htmlFor="join-full-name" style={labelStyle}>Full Name <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      id="join-full-name"
                      type="text"
                      maxLength={100}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Smith"
                      style={inputStyle}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="join-email" style={labelStyle}>Email <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      id="join-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle}
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label htmlFor="join-phone" style={labelStyle}>Phone Number <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      id="join-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      placeholder="(704) 555-1234"
                      style={inputStyle}
                    />
                    {phone.length > 0 && phone.replace(/\D/g, '').length < 10 && (
                      <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '4px 0 0' }}>
                        Please enter a valid 10-digit phone number
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="join-password" style={labelStyle}>Password <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      id="join-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      style={inputStyle}
                    />
                    {password.length > 0 && password.length < 8 && (
                      <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '4px 0 0' }}>
                        Password must be at least 8 characters
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="join-confirm-password" style={labelStyle}>Confirm Password <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      id="join-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      style={inputStyle}
                    />
                    {confirmPassword.length > 0 && password !== confirmPassword && (
                      <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '4px 0 0' }}>
                        Passwords don&apos;t match
                      </p>
                    )}
                  </div>

                  {/* Goal pills */}
                  <div>
                    <label style={labelStyle}>
                      What are you most looking for? <span style={{ color: '#C6A664' }}>*</span>
                    </label>
                    <div role="radiogroup" aria-label="What are you most looking for?" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                      {GOAL_OPTIONS.map((opt) => {
                        const active = goal === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setGoal(opt.value)}
                            style={{
                              padding: '8px 14px',
                              borderRadius: '100px',
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              border: active ? '1px solid #C6A664' : '1px solid rgba(255,255,255,0.15)',
                              backgroundColor: active ? '#C6A664' : 'transparent',
                              color: active ? '#1A1A1A' : 'rgba(255,255,255,0.7)',
                              transition: 'all 150ms ease',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {formError && (
                    <p style={{ fontSize: '0.875rem', color: '#ef4444', margin: 0 }}>{formError}</p>
                  )}

                  <TurnstileWidget
                    ref={turnstileRef}
                    onSuccess={setCaptchaToken}
                    onExpire={() => setCaptchaToken('')}
                    onError={() => setCaptchaToken('')}
                  />

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !isFormValid || captchaGateActive}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '14px 32px',
                      backgroundColor: submitting || !isFormValid || captchaGateActive ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
                      color: '#000000',
                      borderRadius: '10px',
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: submitting || !isFormValid ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.01em',
                      transition: 'all 200ms ease',
                      marginTop: '4px',
                    }}
                  >
                    {submitting ? (
                      <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting to checkout...</>
                    ) : (
                      <>Continue to Checkout <ArrowRight style={{ width: '16px', height: '16px' }} /></>
                    )}
                  </button>

                  {/* Ambassador referral - social proof when resolved, collapsed
                      input otherwise. Pre-filled from ?ref= on mount. */}
                  {resolvedAmbassador ? (
                    <div style={{
                      padding: '14px 16px',
                      backgroundColor: 'rgba(198, 166, 100, 0.10)',
                      border: '1px solid rgba(198, 166, 100, 0.30)',
                      borderRadius: '10px',
                    }}>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', letterSpacing: '0.08em' }}>
                        REFERRED BY
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#C6A664' }}>
                        {resolvedAmbassador.full_name}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', marginTop: '6px' }}>
                        You{"'"}ll receive locked-in pricing as a thank-you for joining via referral.
                      </div>
                    </div>
                  ) : (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)' }}>
                        Have a referral code?
                      </summary>
                      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          aria-label="Referral code"
                          placeholder="Enter code"
                          value={referralCodeInput}
                          onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                          onBlur={(e) => void validateReferralCode(e.target.value)}
                          style={{ ...inputStyle, flex: 1, textTransform: 'uppercase' }}
                        />
                        <button
                          type="button"
                          onClick={() => void validateReferralCode(referralCodeInput)}
                          disabled={validatingCode}
                          style={{
                            padding: '0 18px',
                            backgroundColor: validatingCode ? 'rgba(198,166,100,0.4)' : '#C6A664',
                            color: '#1A1A1A',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: validatingCode ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {validatingCode ? 'Checking...' : 'Apply'}
                        </button>
                      </div>
                      {referralCodeError && (
                        <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '6px', marginBottom: 0 }}>{referralCodeError}</p>
                      )}
                    </details>
                  )}

                  {/* Discount / promo — hidden when ambassador referral pricing is active */}
                  {resolvedAmbassador ? (
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                      Referral pricing applied — discount codes can{"'"}t be combined.
                    </p>
                  ) : (
                    <PromoCodeField
                      value={promoCodeInput}
                      onValueChange={handlePromoInputChange}
                      appliedCode={appliedPromoCode}
                      onApply={handlePromoApply}
                      onDismiss={clearPromo}
                      error={promoCodeError}
                      inputStyle={inputStyle}
                      defaultOpen={prefillPromoFromUrl}
                      applying={promoQuoting}
                    />
                  )}

                  {/* SMS consent - optional opt-in (Twilio A2P 10DLC compliance) */}
                  <div style={{
                    marginBottom: '4px',
                    padding: '14px 16px',
                    backgroundColor: 'rgba(198, 166, 100, 0.05)',
                    border: '1px solid rgba(198, 166, 100, 0.15)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}>
                    <input
                      type="checkbox"
                      id="sms-consent"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                      style={{
                        marginTop: '3px',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: '#C6A664',
                        flexShrink: 0,
                      }}
                    />
                    <label
                      htmlFor="sms-consent"
                      style={{
                        fontSize: '0.875rem',
                        color: 'rgba(255, 255, 255, 0.75)',
                        lineHeight: 1.55,
                        cursor: 'pointer',
                      }}
                    >
                      Yes, send me event reminders and member updates by text from 704 Collective at the phone number above. Message frequency varies. Message and data rates may apply. Reply STOP to cancel, HELP for help. View our{' '}
                      <Link href="/privacy" style={{ color: '#C6A664', textDecoration: 'underline' }}>Privacy Policy</Link>
                      {' '}and{' '}
                      <Link href="/terms" style={{ color: '#C6A664', textDecoration: 'underline' }}>Terms</Link>.
                    </label>
                  </div>

                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 }}>
                    You{"'"}ll be redirected to Stripe for secure payment. By continuing, you agree to our{' '}
                    <Link href="/terms" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline' }}>Terms</Link>
                    {' '}and{' '}
                    <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline' }}>Privacy Policy</Link>.
                  </p>

                  <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', margin: 0 }}>
                    Already a member?{' '}
                    <Link href="/login" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>
                      Sign in
                    </Link>
                  </p>
                </div>
              </section>
            </FadeUp>
          ) : (
            /* ── Tier picker ─────────────────────────────────────────────── */
            <FadeUp>
              <section style={{ maxWidth: '600px', margin: '0 auto 64px', textAlign: 'center' }}>
                <p style={{
                  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em',
                  textTransform: 'uppercase', color: '#C6A664', marginBottom: '16px',
                }}>
                  Membership
                </p>
                <h1 style={{
                  fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 700, color: '#FFFFFF',
                  letterSpacing: '-0.02em', marginBottom: '40px', lineHeight: 1.15,
                }}>
                  Choose your membership
                </h1>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '20px',
                }} className="tier-grid">

                  {/* Social Card */}
                  <div style={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(198,166,100,0.35)',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                      704 Social
                    </h2>
                    {promoQuote && !resolvedAmbassador ? (
                      <div data-testid="promo-price-block" style={{ marginBottom: '8px' }}>
                        <PromoDealLines quote={promoQuote} />
                      </div>
                    ) : (
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: '#C6A664', margin: 0 }}>
                      {resolvedAmbassador ? (
                        <>
                          <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '1.5rem', marginRight: '0.5rem' }}>
                            {SOCIAL_TIER.monthlyPrice}
                          </span>
                          <span>$35</span>
                        </>
                      ) : flashSaleActive ? (
                        <>
                          <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '1.5rem', marginRight: '0.5rem' }}>
                            {SOCIAL_TIER.monthlyPrice}
                          </span>
                          <span>{FLASH_SALE.firstMonthPrice}</span>
                        </>
                      ) : (
                        <span>{SOCIAL_TIER.monthlyPrice}</span>
                      )}
                      <span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>/month</span>
                    </p>
                    )}
                    {resolvedAmbassador && (
                      <p style={{ fontSize: '0.875rem', color: '#C6A664', marginTop: '0.5rem', margin: '4px 0 0' }}>
                        Referral rate - locked in for life
                      </p>
                    )}
                    {flashSaleActive && !resolvedAmbassador && !promoQuote && (
                      <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', margin: '-4px 0 0', fontStyle: 'italic' }}>
                        first month
                      </p>
                    )}
                    {flashSaleActive && !resolvedAmbassador && !promoQuote ? (
                      <p style={{ fontSize: '0.75rem', color: '#C6A664', margin: '0 0 16px', lineHeight: 1.5 }}>
                        Use code <strong style={{ color: '#FFFFFF' }}>{FLASH_SALE.promoCode}</strong> at checkout. Then $49/mo after. Ends May 14.
                      </p>
                    ) : !promoQuote || resolvedAmbassador ? (
                      <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
                        Cancel anytime
                      </p>
                    ) : null}
                    {/* Logged-in non-members skip the form entirely, so the
                        discount field has to live on the card or they never get
                        one. Logged-out visitors still meet it on ?plan=social. */}
                    {(user && !isActiveMember || (!resolvedAmbassador && prefillPromoFromUrl)) && (
                      <div style={{ textAlign: 'left', marginBottom: '12px' }}>
                        {resolvedAmbassador ? (
                          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                            Referral pricing applied — discount codes can{"'"}t be combined.
                          </p>
                        ) : (
                          <PromoCodeField
                            value={promoCodeInput}
                            onValueChange={handlePromoInputChange}
                            appliedCode={appliedPromoCode}
                            onApply={handlePromoApply}
                            onDismiss={clearPromo}
                            error={promoCodeError}
                            inputStyle={inputStyle}
                            defaultOpen={prefillPromoFromUrl}
                            applying={promoQuoting}
                          />
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleSocialClick}
                      disabled={socialLoading}
                      style={{
                        width: '100%',
                        padding: '12px 24px',
                        backgroundColor: socialLoading ? 'rgba(198,166,100,0.6)' : '#C6A664',
                        color: '#1A1A1A',
                        borderRadius: '10px',
                        fontSize: '0.9375rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: socialLoading ? 'not-allowed' : 'pointer',
                        letterSpacing: '0.01em',
                        transition: 'all 200ms ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      {socialLoading ? (
                        <><Loader2 style={{ width: '15px', height: '15px', animation: 'spin 1s linear infinite' }} /> Redirecting...</>
                      ) : (
                        'Get Started'
                      )}
                    </button>
                  </div>

                  {/* Business Card */}
                  <div style={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    padding: '32px 24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                      704 Business
                    </h2>
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: '#C6A664', margin: 0 }}>
                      {resolvedAmbassador ? (
                        <>
                          <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '1.5rem', marginRight: '0.5rem' }}>
                            {BUSINESS_TIER.monthlyPrice}
                          </span>
                          <span>$250</span>
                        </>
                      ) : (
                        <span>{BUSINESS_TIER.monthlyPrice}</span>
                      )}
                      <span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>/month</span>
                    </p>
                    {resolvedAmbassador && (
                      <p style={{ fontSize: '0.875rem', color: '#C6A664', marginTop: '0.5rem', margin: '4px 0 0' }}>
                        Referral rate - locked in until 2027
                      </p>
                    )}
                    <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
                      Application required
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push('/apply/business')}
                      style={{
                        width: '100%',
                        padding: '12px 24px',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        color: '#FFFFFF',
                        borderRadius: '10px',
                        fontSize: '0.9375rem',
                        fontWeight: 700,
                        border: '1px solid rgba(255,255,255,0.15)',
                        cursor: 'pointer',
                        letterSpacing: '0.01em',
                        transition: 'all 200ms ease',
                      }}
                    >
                      Apply Now
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <Link
                    href="/dashboard"
                    style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255,255,255,0.35)',
                      textDecoration: 'underline',
                    }}
                  >
                    Continue as non-member
                  </Link>
                </div>
              </section>
            </FadeUp>
          )}

          {/* Benefits */}
          <section style={{ maxWidth: '420px', margin: '0 auto 64px' }}>
            <FadeUp>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '20px' }}>
                Here{"'"}s what you{"'"}ll get:
              </h2>
            </FadeUp>
            <StaggerContainer staggerDelay={0.06}>
              {benefits.map((b) => (
                <StaggerItem key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px 0' }}>
                  <span style={{ color: '#C6A664', fontSize: '0.875rem', marginTop: '2px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{b}</span>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>

          {/* Upcoming Events */}
          <section>
            <FadeUp>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '24px' }}>
                Upcoming Events
              </h2>
            </FadeUp>

            {eventsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="events-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#1A1A1A' }}>
                    <div style={{ aspectRatio: '16/9', backgroundColor: '#2E2E2E', animation: 'pulse 2s infinite' }} />
                    <div style={{ padding: '16px' }}>
                      <div style={{ height: '16px', width: '70%', backgroundColor: '#2E2E2E', borderRadius: '4px', marginBottom: '10px' }} />
                      <div style={{ height: '14px', width: '50%', backgroundColor: '#2E2E2E', borderRadius: '4px' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : events.length > 0 ? (
              <StaggerContainer staggerDelay={0.1} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="events-grid">
                {events.map((event) => (
                  <StaggerItem key={event.id} style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#1A1A1A', transition: 'border-color 200ms ease, transform 200ms ease' }} className="card-hover">
                    <div style={{ aspectRatio: '16/9', overflow: 'hidden', backgroundColor: '#2E2E2E', position: 'relative' }}>
                      {event.image_url ? (
                        <Image src={event.image_url} alt={event.title} fill style={{ objectFit: 'cover' }} unoptimized={!event.image_url?.includes('supabase')} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Calendar style={{ width: '32px', height: '32px', color: 'rgba(255,255,255,0.15)' }} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '16px' }}>
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.title}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)' }}>
                          <Calendar style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                          <span>{format(new Date(event.start_time), 'EEE, MMM d · h:mm a')}</span>
                        </div>
                        {event.location_name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>
                            <MapPin style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.location_name}</span>
                          </div>
                        )}
                        {event.capacity && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>
                            <Users style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                            <span>{event.capacity} spots</span>
                          </div>
                        )}
                      </div>
                      {event.is_members_only && (
                        <span style={{ display: 'inline-block', marginTop: '10px', fontSize: '0.6875rem', fontWeight: 600, color: '#C6A664', backgroundColor: 'rgba(198,166,100,0.08)', padding: '4px 10px', borderRadius: '100px' }}>
                          Members Only
                        </span>
                      )}
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            ) : (
              <FadeUp>
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.4)' }}>
                    No upcoming events at the moment. Check back soon!
                  </p>
                </div>
              </FadeUp>
            )}
          </section>
        </div>
        </MarketingPageRoot>
      </main>
      <Footer />

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @media (max-width: 768px) {
          .events-grid { grid-template-columns: 1fr !important; }
          .tier-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .events-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}

export default function Join() {
  return (
    <Suspense>
      <JoinInner />
    </Suspense>
  );
}
