'use client';

import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { addDays, format } from 'date-fns';
import { Calendar, MapPin, Users, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  FadeUp,
  FadeIn,
  StaggerContainer,
  StaggerItem,
} from '@/components/Animations';

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
  'Cancel anytime — no contracts',
];

export default function Join() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  usePageTitle("Join 704 Collective - Charlotte's Young Professionals Community");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(true);
  const [redirectError, setRedirectError] = useState(false);

  // Auto-redirect to Stripe Checkout on load
  useEffect(() => {
    if (authLoading) return;
    const redirectToCheckout = async () => {
      try {
        setRedirecting(true);
        setRedirectError(false);
        const { data, error } = await supabase.functions.invoke('create-checkout', { body: {} });
        if (error || data?.error) { setRedirectError(true); setRedirecting(false); return; }
        if (data?.url) { window.location.href = data.url; } else { setRedirectError(true); setRedirecting(false); }
      } catch { setRedirectError(true); setRedirecting(false); }
    };
    redirectToCheckout();
  }, [authLoading, user]);

  // Fetch events within 15 days
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
      setLoading(false);
    }
    fetchEvents();
  }, []);

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error('Failed to sign in with Google');
  };

  const handleRetry = () => {
    setRedirecting(true);
    setRedirectError(false);
    supabase.functions.invoke('create-checkout', { body: {} }).then(({ data, error }) => {
      if (error || data?.error || !data?.url) { setRedirectError(true); setRedirecting(false); }
      else { window.location.href = data.url; }
    }).catch(() => { setRedirectError(true); setRedirecting(false); });
  };

  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '13px 28px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600,
    backgroundColor: '#FFFFFF', color: '#000', border: 'none', cursor: 'pointer',
    transition: 'all 200ms ease', textDecoration: 'none', width: '100%',
  };
  const btnGhost: React.CSSProperties = {
    ...btnPrimary, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.12)',
  };

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', backgroundColor: '#000', minHeight: '100vh' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px 80px' }}>

          {/* Redirect Status */}
          <section style={{ maxWidth: '420px', margin: '0 auto 56px', textAlign: 'center' }}>
            {redirecting && !redirectError ? (
              <FadeIn>
                <div style={{ padding: '40px 0' }}>
                  <Loader2 style={{ width: '36px', height: '36px', color: '#C6A664', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
                  <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)' }}>Redirecting to checkout...</p>
                </div>
              </FadeIn>
            ) : redirectError ? (
              <FadeUp>
                <div style={{ padding: '32px 0' }}>
                  <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
                    Something went wrong. Please try again.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button onClick={handleRetry} style={btnGhost}>
                      <RefreshCw style={{ width: '15px', height: '15px' }} /> Retry
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                      <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    </div>

                    <button onClick={handleGoogleSignIn} style={btnGhost}>
                      <svg style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Continue with Google
                    </button>
                  </div>
                </div>
              </FadeUp>
            ) : null}
          </section>

          {/* Benefits */}
          <section style={{ maxWidth: '420px', margin: '0 auto 56px' }}>
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

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="events-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#1A1A1A' }}>
                    <div style={{ aspectRatio: '16/9', backgroundColor: '#2E2E2E', animation: 'pulse 2s infinite' }} />
                    <div style={{ padding: '16px' }}>
                      <div style={{ height: '16px', width: '70%', backgroundColor: '#2E2E2E', borderRadius: '4px', marginBottom: '10px', animation: 'pulse 2s infinite' }} />
                      <div style={{ height: '14px', width: '50%', backgroundColor: '#2E2E2E', borderRadius: '4px', animation: 'pulse 2s infinite' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : events.length > 0 ? (
              <StaggerContainer staggerDelay={0.1} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="events-grid">
                {events.map((event) => (
                  <StaggerItem
                    key={event.id}
                    style={{
                      borderRadius: '14px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.06)',
                      backgroundColor: '#1A1A1A',
                      transition: 'border-color 200ms ease, transform 200ms ease',
                    }}
                    className="card-hover"
                  >
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
      </main>
      <Footer />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @media (max-width: 768px) {
          .events-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .events-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}