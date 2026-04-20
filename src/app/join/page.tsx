'use client';

import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { addDays, format } from 'date-fns';
import { Calendar, MapPin, Users, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { PromoBanner } from '@/components/PromoBanner';
import { Footer } from '@/components/Footer';
import {
  FadeUp,
  StaggerContainer,
  StaggerItem,
} from '@/components/Animations';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

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
  '8+ curated events every month',
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

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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
  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [goal, setGoal]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  // Tier picker Social card loading state
  const [socialLoading, setSocialLoading] = useState(false);

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

  const isFormValid = fullName.trim().length > 0 && email.trim().length > 0 && phone.trim().length > 0 && goal !== '';

  const handleSubmit = async () => {
    if (!isFormValid || submitting) return;
    setSubmitting(true);
    setFormError(null);

    const cleanPhone = phone.replace(/\D/g, '');

    // Fire-and-forget: capture prospect
    try {
      await supabase.functions.invoke('capture-prospect', {
        body: { email: email.trim(), full_name: fullName.trim(), phone: cleanPhone },
      });
    } catch {
      // Non-blocking - do not abort checkout
    }

    // Call create-checkout
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          email: email.trim(),
          name: fullName.trim(),
          phone: cleanPhone,
          primary_goal: goal,
        },
      });
      if (error) throw error;
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
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: { email: user.email },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (error) throw error;
        const url = (data as { url?: string })?.url;
        if (!url) throw new Error('No checkout URL returned');
        window.location.href = url;
      } catch {
        router.push('/join?plan=social');
      } finally {
        setSocialLoading(false);
      }
    } else {
      router.push('/join?plan=social');
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
      <PromoBanner />
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
                <p style={{
                  fontSize: '1rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6,
                  marginBottom: '32px', textAlign: 'center',
                }}>
                  Join Charlotte{"'"}s most curated social club for $35/month. Cancel anytime.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Full Name */}
                  <div>
                    <label style={labelStyle}>Full Name <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
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
                    <label style={labelStyle}>Email <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={inputStyle}
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label style={labelStyle}>Phone Number <span style={{ color: '#C6A664' }}>*</span></label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      placeholder="(704) 555-1234"
                      style={inputStyle}
                    />
                  </div>

                  {/* Goal pills */}
                  <div>
                    <label style={labelStyle}>
                      What are you most looking for? <span style={{ color: '#C6A664' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                      {GOAL_OPTIONS.map((opt) => {
                        const active = goal === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
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

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !isFormValid}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '14px 32px',
                      backgroundColor: submitting || !isFormValid ? 'rgba(255,255,255,0.3)' : '#FFFFFF',
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
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: '#C6A664', margin: 0 }}>
                      $35<span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>/month</span>
                    </p>
                    <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
                      Cancel anytime
                    </p>
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
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                      $300<span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>/month</span>
                    </p>
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
