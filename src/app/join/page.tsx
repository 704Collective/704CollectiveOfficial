'use client';

import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { addDays, format } from 'date-fns';
import { Calendar, MapPin, Users, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import {
  FadeUp,
  FadeIn,
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
  'Cancel anytime — no contracts',
];

export default function Join() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  usePageTitle("Join 704 Collective - Charlotte's Young Professionals Community");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // If already an active member, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

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

  return (
    <>
      <Nav />
      <main id="main-content" style={{ paddingTop: '64px', backgroundColor: '#000', minHeight: '100dvh' }}>
        <MarketingPageRoot>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px 80px' }}>

          {/* Hero CTA */}
          <FadeUp>
            <section
              style={{
                maxWidth: '480px',
                margin: '0 auto 64px',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: '#C6A664',
                  marginBottom: '16px',
                }}
              >
                Social Membership
              </p>
              <h1
                style={{
                  fontSize: 'clamp(2rem, 5vw, 2.75rem)',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '-0.02em',
                  marginBottom: '16px',
                  lineHeight: 1.15,
                }}
              >
                Your people are already here.
              </h1>
              <p
                style={{
                  fontSize: '1rem',
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.6,
                  marginBottom: '32px',
                }}
              >
                Join Charlotte's most curated social club for $30/month.
                Cancel anytime.
              </p>

              <Link
                href="/signup"
                style={{
                  width: '100%', maxWidth: '320px', justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 32px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  borderRadius: '10px',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  letterSpacing: '0.01em',
                  transition: 'all 200ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,255,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Join Now — $30/mo
                <ArrowRight style={{ width: '16px', height: '16px' }} />
              </Link>

              <p
                style={{
                  marginTop: '12px',
                  fontSize: '0.8125rem',
                  color: 'rgba(255,255,255,0.25)',
                }}
              >
                Already a member?{' '}
                <Link
                  href="/login"
                  style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}
                >
                  Sign in
                </Link>
              </p>
            </section>
          </FadeUp>

          {/* Benefits */}
          <section style={{ maxWidth: '420px', margin: '0 auto 64px' }}>
            <FadeUp>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  marginBottom: '20px',
                }}
              >
                Here's what you'll get:
              </h2>
            </FadeUp>
            <StaggerContainer staggerDelay={0.06}>
              {benefits.map((b) => (
                <StaggerItem
                  key={b}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px 0' }}
                >
                  <span
                    style={{ color: '#C6A664', fontSize: '0.875rem', marginTop: '2px', flexShrink: 0 }}
                  >
                    ✓
                  </span>
                  <span
                    style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}
                  >
                    {b}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>

          {/* Upcoming Events */}
          <section>
            <FadeUp>
              <h2
                style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '24px' }}
              >
                Upcoming Events
              </h2>
            </FadeUp>

            {loading ? (
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}
                className="events-grid"
              >
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      borderRadius: '14px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.06)',
                      backgroundColor: '#1A1A1A',
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: '16/9',
                        backgroundColor: '#2E2E2E',
                        animation: 'pulse 2s infinite',
                      }}
                    />
                    <div style={{ padding: '16px' }}>
                      <div
                        style={{
                          height: '16px',
                          width: '70%',
                          backgroundColor: '#2E2E2E',
                          borderRadius: '4px',
                          marginBottom: '10px',
                        }}
                      />
                      <div
                        style={{ height: '14px', width: '50%', backgroundColor: '#2E2E2E', borderRadius: '4px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : events.length > 0 ? (
              <StaggerContainer
                staggerDelay={0.1}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}
                className="events-grid"
              >
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
                    <div
                      style={{
                        aspectRatio: '16/9',
                        overflow: 'hidden',
                        backgroundColor: '#2E2E2E',
                        position: 'relative',
                      }}
                    >
                      {event.image_url ? (
                        <Image
                          src={event.image_url}
                          alt={event.title}
                          fill
                          style={{ objectFit: 'cover' }}
                          unoptimized={!event.image_url?.includes('supabase')}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Calendar
                            style={{ width: '32px', height: '32px', color: 'rgba(255,255,255,0.15)' }}
                          />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '16px' }}>
                      <h3
                        style={{
                          fontSize: '0.9375rem',
                          fontWeight: 600,
                          color: '#FFFFFF',
                          marginBottom: '10px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {event.title}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.8125rem',
                            color: 'rgba(255,255,255,0.4)',
                          }}
                        >
                          <Calendar style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                          <span>{format(new Date(event.start_time), 'EEE, MMM d · h:mm a')}</span>
                        </div>
                        {event.location_name && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '0.8125rem',
                              color: 'rgba(255,255,255,0.35)',
                            }}
                          >
                            <MapPin style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                            <span
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {event.location_name}
                            </span>
                          </div>
                        )}
                        {event.capacity && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '0.8125rem',
                              color: 'rgba(255,255,255,0.35)',
                            }}
                          >
                            <Users style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                            <span>{event.capacity} spots</span>
                          </div>
                        )}
                      </div>
                      {event.is_members_only && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: '10px',
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            color: '#C6A664',
                            backgroundColor: 'rgba(198,166,100,0.08)',
                            padding: '4px 10px',
                            borderRadius: '100px',
                          }}
                        >
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