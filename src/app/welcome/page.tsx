'use client';

import { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, MapPin, Calendar } from 'lucide-react';
import TurnstileWidget, { TURNSTILE_ENABLED, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendWelcomeOnboardingCompleteEmail } from '@/app/actions/transactionalEmails';
import { sendRsvpConfirmationEmail } from '@/hooks/useTicketActions';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { format } from 'date-fns';

type Status = 'loading' | 'setup' | 'rsvp_gate' | 'email_confirmation_required' | 'success' | 'error';

interface WelcomeEventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  location_address: string | null;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  company: string;
  title: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [rsvpEvents, setRsvpEvents] = useState<WelcomeEventRow[]>([]);
  const [rsvpedEventIds, setRsvpedEventIds] = useState<Set<string>>(new Set());
  const [rsvpBusyId, setRsvpBusyId] = useState<string | null>(null);
  const [continueBusy, setContinueBusy] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [confirmationCheckCount, setConfirmationCheckCount] = useState(0);
  const [user, setUser] = useState<{ email?: string; email_confirmed_at?: string | null } | null>(null);

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    company: '',
    title: '',
  });

  const attemptRef = useRef(0);
  const maxAttempts = 5;
  const retryDelay = 2000;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;

      // Store user for resend handler and email display
      setUser(session.user);

      // Email must be confirmed before we allow onboarding to advance
      if (!session.user.email_confirmed_at) {
        if (!cancelled) setStatus('email_confirmation_required');
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('has_completed_onboarding_rsvp')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled && prof?.has_completed_onboarding_rsvp) {
        router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionId) {
      router.replace('/dashboard');
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-checkout-session', {
          body: { session_id: sessionId },
        });

        if (error || data?.error) {
          attemptRef.current += 1;
          if (attemptRef.current < maxAttempts) {
            setTimeout(verify, retryDelay);
          } else {
            setErrorMsg(data?.error || 'Something went wrong verifying your session.');
            setStatus('error');
          }
          return;
        }

        const fullName = (data?.name || '').trim();
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        setForm(prev => ({
          ...prev,
          firstName,
          lastName,
          email: data?.email || '',
          phone: data?.phone || '',
        }));

        setStatus('setup');
      } catch {
        attemptRef.current += 1;
        if (attemptRef.current < maxAttempts) {
          setTimeout(verify, retryDelay);
        } else {
          setStatus('error');
          setErrorMsg('Could not verify your checkout session.');
        }
      }
    };

    verify();
  }, [sessionId, router]);

  useEffect(() => {
    if (status !== 'rsvp_gate') return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { data: evs, error } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, location_name, location_address')
        .eq('is_published', true)
        .gte('start_time', now.toISOString())
        .lte('start_time', end.toISOString())
        .order('start_time', { ascending: true });
      if (cancelled) return;
      if (error) {
        setRsvpEvents([]);
        return;
      }
      setRsvpEvents((evs || []) as WelcomeEventRow[]);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // Canonical RSVP state via get_my_events (attendance_credentials),
      // replacing the legacy tickets read.
      const { data: myEvents } = await supabase.rpc('get_my_events');
      const next = new Set<string>();
      (((myEvents ?? []) as unknown) as { event_id: string | null }[]).forEach(r => {
        if (r.event_id) next.add(r.event_id);
      });
      setRsvpedEventIds(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Poll every 5 s while on the email confirmation gate.
  // Uses refreshSession() (forces a network round-trip) so email_confirmed_at
  // is always fresh rather than read from a stale local cache.
  useEffect(() => {
    if (status !== 'email_confirmation_required') return;

    const interval = setInterval(async () => {
      const { data } = await supabase.auth.refreshSession();
      const freshUser = data?.user ?? null;
      if (freshUser?.email_confirmed_at) {
        clearInterval(interval);
        setStatus('loading'); // Show loading spinner briefly while session settles
        setConfirmationCheckCount(0);
        // proceedAfterAuth will now pass the email check and continue normally
        await proceedAfterAuthRef.current?.();
      } else {
        setConfirmationCheckCount(c => c + 1);
      }
    }, 5000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Ref so the polling useEffect can call proceedAfterAuth without stale closure issues
  const proceedAfterAuthRef = useRef<(() => Promise<void>) | null>(null);

  const proceedAfterAuth = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) {
      setFormErrors({ password: 'Could not load your session.' });
      setSubmitting(false);
      return;
    }

    // Email must be confirmed before advancing to the RSVP gate.
    // Unconfirmed users see a resend-confirmation gate; a background poll auto-advances them.
    if (!u.email_confirmed_at) {
      setStatus('email_confirmation_required');
      setSubmitting(false);
      return;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('member_type, has_completed_onboarding_rsvp')
      .eq('id', u.id)
      .maybeSingle();

    const needsRsvpGate =
      prof?.member_type !== 'business' &&
      !prof?.has_completed_onboarding_rsvp;

    if (!needsRsvpGate) {
      setStatus('success');
      setTimeout(() => router.push('/dashboard?welcome=1'), 1800);
      setSubmitting(false);
      return;
    }

    setStatus('rsvp_gate');
    setSubmitting(false);
  }, [router]);

  // Keep the ref in sync so the polling interval always calls the latest version
  useEffect(() => {
    proceedAfterAuthRef.current = proceedAfterAuth;
  }, [proceedAfterAuth]);

  const handleResendConfirmation = async () => {
    const emailToResend = user?.email || form.email;
    if (!emailToResend) return;
    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailToResend,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/welcome` },
      });
      if (error) {
        toast.error('Could not resend confirmation. Try again in a moment.');
      } else {
        toast.success('Confirmation email resent. Check your inbox.');
      }
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setIsResending(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: FormErrors = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required';
    if (!form.phone.trim()) errors.phone = 'Phone number is required';
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('set-initial-password', {
        body: {
          session_id: sessionId,
          email: form.email,
          password: form.password,
          first_name: form.firstName,
          last_name: form.lastName,
          phone: form.phone,
          company: form.company,
          title: form.title,
        },
      });

      if (error || data?.error) {
        const msg = data?.error || error?.message || 'Failed to set up account.';
        if (msg === 'already_setup') {
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
            options: { captchaToken: captchaToken || undefined },
          });
          if (signInErr) {
            setFormErrors({ password: 'This account is already set up. Try signing in.' });
            turnstileRef.current?.reset();
            setCaptchaToken('');
            setSubmitting(false);
            return;
          }
          await proceedAfterAuth();
          return;
        }
        setFormErrors({ password: msg });
        setSubmitting(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
        options: { captchaToken: captchaToken || undefined },
      });

      if (signInErr) {
        setFormErrors({ password: 'Account created but sign-in failed. Please sign in manually.' });
        turnstileRef.current?.reset();
        setCaptchaToken('');
        setSubmitting(false);
        return;
      }

      await proceedAfterAuth();
    } catch {
      setFormErrors({ password: 'Something went wrong. Please try again.' });
      setSubmitting(false);
    }
  };

  const hasRsvpRequirementMet =
    rsvpEvents.length === 0 || rsvpEvents.some(e => rsvpedEventIds.has(e.id));

  const handleWelcomeRsvp = async (eventId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (rsvpedEventIds.has(eventId)) return;
    setRsvpBusyId(eventId);
    try {
      // Member RSVP goes through the create-member-rsvp edge function, which
      // creates a member_rsvp attendance_credential (the canonical layer),
      // mirroring the event page. invoke() attaches the user's JWT.
      // The function's body only accepts event_id, so the old
      // welcome_onboarding_rsvp source attribution is dropped.
      const { data, error } = await supabase.functions.invoke('create-member-rsvp', {
        body: { event_id: eventId },
      });
      if (error) {
        // No waitlist fallback on welcome — and no confirmation email on error.
        return;
      }
      if (data?.already_rsvped) {
        toast.info('You already have an RSVP for this event');
        setRsvpedEventIds(prev => new Set([...prev, eventId]));
        return;
      }
      setRsvpedEventIds(prev => new Set([...prev, eventId]));
      // Confirmation email — shared helper (identical payload to event-detail /
      // registerMemberTicket). Fire-and-forget; never fatal to onboarding.
      const ev = rsvpEvents.find(e => e.id === eventId);
      if (ev) {
        const memberName = [form.firstName, form.lastName].filter(Boolean).join(' ').trim() || null;
        void sendRsvpConfirmationEmail({
          event: ev,
          memberName,
          credentialToken: data?.credential_token ?? null,
        });
      }
    } finally {
      setRsvpBusyId(null);
    }
  };

  const handleContinueFromRsvp = async () => {
    if (!hasRsvpRequirementMet) return;
    setContinueBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setContinueBusy(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ has_completed_onboarding_rsvp: true })
        .eq('id', user.id);
      if (error) {
        setContinueBusy(false);
        return;
      }
      void sendWelcomeOnboardingCompleteEmail();
      router.push('/dashboard?welcome=1');
    } finally {
      setContinueBusy(false);
    }
  };

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#FFFFFF',
    fontSize: '16px' as const,
    minHeight: '48px',
  };

  const errorInputStyle = {
    ...inputStyle,
    border: '1px solid #ef4444',
  };

  return (
    <>
      <Nav />
      <main id="main-content" style={{ paddingTop: '64px', backgroundColor: '#0d0d0d', minHeight: '100dvh' }}>
        <MarketingPageRoot>
        {status === 'rsvp_gate' ? (
          <div style={{
            maxWidth: '920px',
            width: '100%',
            margin: '0 auto',
            padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 32px)',
            minHeight: 'calc(100dvh - 64px)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 'clamp(24px, 4vw, 40px)' }}>
              <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: '#FFFFFF', marginBottom: '10px' }}>
                RSVP to an upcoming event
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: '560px', margin: '0 auto' }}>
                Pick at least one event in the next 30 days so we know what to expect you at. You can always change this later from your dashboard.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
              {rsvpEvents.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: '0.9375rem' }}>
                  No published events in the next 30 days yet. You can continue to your dashboard.
                </p>
              ) : (
                rsvpEvents.map(ev => {
                  const start = new Date(ev.start_time);
                  const has = rsvpedEventIds.has(ev.id);
                  const busy = rsvpBusyId === ev.id;
                  const loc = [ev.location_name, ev.location_address].filter(Boolean).join(' · ') || 'TBA';
                  return (
                    <div
                      key={ev.id}
                      style={{
                        backgroundColor: '#1A1A1A',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '14px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ flex: '1 1 220px' }}>
                          <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>{ev.title}</h2>
                          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <Calendar size={14} style={{ flexShrink: 0 }} />
                            {format(start, 'EEEE, MMM d, yyyy · h:mm a')}
                          </p>
                          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <MapPin size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{loc}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleWelcomeRsvp(ev.id)}
                          disabled={has || busy}
                          style={{
                            flexShrink: 0,
                            minWidth: '120px',
                            minHeight: '44px',
                            padding: '0 18px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: has || busy ? 'default' : 'pointer',
                            border: has ? '1px solid rgba(34,197,94,0.5)' : '1px solid #C6A664',
                            backgroundColor: has ? 'rgba(34,197,94,0.12)' : 'transparent',
                            color: has ? '#86efac' : '#C6A664',
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          {busy ? '…' : has ? 'RSVP’d' : 'RSVP'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleContinueFromRsvp}
                disabled={!hasRsvpRequirementMet || continueBusy}
                style={{
                  minWidth: '280px',
                  minHeight: '52px',
                  padding: '0 28px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  border: 'none',
                  cursor: !hasRsvpRequirementMet || continueBusy ? 'not-allowed' : 'pointer',
                  backgroundColor: hasRsvpRequirementMet && !continueBusy ? '#C6A664' : 'rgba(255,255,255,0.12)',
                  color: hasRsvpRequirementMet && !continueBusy ? '#1A1A1A' : 'rgba(255,255,255,0.35)',
                  transition: 'background-color 200ms ease, color 200ms ease',
                }}
              >
                {continueBusy ? 'Saving…' : 'Continue to Dashboard'}
              </button>
            </div>
          </div>
        ) : (
        <div style={{
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto',
          padding: 'clamp(32px, 6vw, 56px) clamp(16px, 5vw, 24px)',
        }}>

          {/* Email confirmation gate */}
          {status === 'email_confirmation_required' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <div style={{
                padding: '32px',
                borderRadius: '12px',
                backgroundColor: 'rgba(198,166,100,0.08)',
                border: '1px solid rgba(198,166,100,0.3)',
                marginBottom: '0',
              }}>
                <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', fontWeight: 600, color: '#C6A664', marginBottom: '12px' }}>
                  Confirm your email
                </h1>
                <p style={{ fontSize: '0.9375rem', color: '#D8D8D8', lineHeight: 1.6, marginBottom: '8px' }}>
                  We sent a confirmation link to{' '}
                  <strong>{user?.email || form.email}</strong>.
                  {' '}Click the link to verify your account, then come back here to finish setting up your membership.
                </p>
                <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', lineHeight: 1.6, marginBottom: '24px' }}>
                  {"Don't see it? Check your Promotions or Spam folder."}
                </p>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={isResending}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '6px',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    backgroundColor: 'transparent',
                    color: '#C6A664',
                    border: '1px solid #C6A664',
                    cursor: isResending ? 'wait' : 'pointer',
                    opacity: isResending ? 0.6 : 1,
                    transition: 'all 200ms ease',
                  }}
                >
                  {isResending ? 'Sending...' : 'Resend confirmation email'}
                </button>
                {confirmationCheckCount > 0 && (
                  <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '16px' }}>
                    Watching for confirmation... ({confirmationCheckCount * 5}s)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <Loader2 style={{ width: '48px', height: '48px', color: '#C6A664', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                Confirming your membership...
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)' }}>
                This only takes a moment.
              </p>
            </div>
          )}

          {/* Setup Form */}
          {status === 'setup' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  backgroundColor: 'rgba(198,166,100,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: '1.5rem',
                }}>
                  🎉
                </div>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 1.875rem)', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                  Welcome to 704 Collective!
                </h1>
                <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Your membership is confirmed. Finish setting up your account below.
                </p>
              </div>

              <div style={{
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: 'clamp(24px, 5vw, 32px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}>

                {/* Name row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <Label htmlFor="firstName" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                      First Name <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      autoComplete="given-name"
                      value={form.firstName}
                      onChange={e => updateField('firstName', e.target.value)}
                      style={formErrors.firstName ? errorInputStyle : inputStyle}
                    />
                    {formErrors.firstName && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.firstName}</p>}
                  </div>
                  <div>
                    <Label htmlFor="lastName" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                      Last Name <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="lastName"
                      type="text"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={e => updateField('lastName', e.target.value)}
                      style={formErrors.lastName ? errorInputStyle : inputStyle}
                    />
                    {formErrors.lastName && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.lastName}</p>}
                  </div>
                </div>

                {/* Email read-only */}
                <div>
                  <Label htmlFor="email" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    disabled
                    style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
                  />
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '4px' }}>
                    From your Stripe checkout
                  </p>
                </div>

                {/* Phone */}
                <div>
                  <Label htmlFor="phone" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Phone <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="xxx-xxx-xxxx"
                    value={form.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    style={formErrors.phone ? errorInputStyle : inputStyle}
                  />
                  {formErrors.phone && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.phone}</p>}
                </div>

                {/* Password */}
                <div>
                  <Label htmlFor="password" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Create Password <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      value={form.password}
                      onChange={e => updateField('password', e.target.value)}
                      style={{ ...(formErrors.password ? errorInputStyle : inputStyle), paddingRight: '48px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {formErrors.password && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div>
                  <Label htmlFor="confirmPassword" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={form.confirmPassword}
                      onChange={e => updateField('confirmPassword', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                      style={{ ...(formErrors.confirmPassword ? errorInputStyle : inputStyle), paddingRight: '48px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {formErrors.confirmPassword && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{formErrors.confirmPassword}</p>}
                </div>

                {/* Optional divider */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px' }}>
                  <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                    Optional
                  </p>
                </div>

                {/* Company */}
                <div>
                  <Label htmlFor="company" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Company
                  </Label>
                  <Input
                    id="company"
                    type="text"
                    autoComplete="organization"
                    placeholder="Where do you work?"
                    value={form.company}
                    onChange={e => updateField('company', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Title */}
                <div>
                  <Label htmlFor="title" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '6px', display: 'block' }}>
                    Title
                  </Label>
                  <Input
                    id="title"
                    type="text"
                    autoComplete="organization-title"
                    placeholder="What's your role?"
                    value={form.title}
                    onChange={e => updateField('title', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {/* Turnstile */}
                <TurnstileWidget
                  ref={turnstileRef}
                  onSuccess={setCaptchaToken}
                  onExpire={() => setCaptchaToken('')}
                  onError={() => setCaptchaToken('')}
                />

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (TURNSTILE_ENABLED && !captchaToken)}
                  style={{
                    width: '100%',
                    minHeight: '52px',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    marginTop: '4px',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: submitting || (TURNSTILE_ENABLED && !captchaToken) ? 'not-allowed' : 'pointer',
                    opacity: submitting || (TURNSTILE_ENABLED && !captchaToken) ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 200ms ease',
                  }}
                >
                  {submitting ? (
                    <><Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />Setting up your account...</>
                  ) : (
                    'Continue'
                  )}
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>
                  You can add a profile photo from your dashboard
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <CheckCircle style={{ width: '56px', height: '56px', color: '#22c55e', margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                You&apos;re all set, {form.firstName}!
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>
                Taking you to your dashboard now...
              </p>
              <div style={{ height: '2px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: '#C6A664', animation: 'progress 2s linear forwards' }} />
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <XCircle style={{ width: '48px', height: '48px', color: '#ef4444', margin: '0 auto 20px' }} />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
                Something went wrong
              </h1>
              <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', marginBottom: '24px', lineHeight: 1.6 }}>
                {errorMsg || "We couldn't verify your session. Your payment may still have gone through."}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => router.push('/dashboard')}
                  style={{ width: '100%', minHeight: '48px', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9375rem' }}
                >
                  Try Dashboard
                </button>
                <a
                  href="mailto:hello@704collective.com"
                  style={{ display: 'block', textAlign: 'center', fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', padding: '12px' }}
                >
                  Contact Support
                </a>
              </div>
            </div>
          )}
        </div>
        )}
        </MarketingPageRoot>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes progress { from { width: 0% } to { width: 100% } }
      `}</style>
    </>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', backgroundColor: '#0d0d0d' }} />}>
      <WelcomeContent />
    </Suspense>
  );
}