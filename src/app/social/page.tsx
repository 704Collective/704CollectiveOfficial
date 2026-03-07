'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import {
  FadeUp,
  FadeIn,
  SlideIn,
  StaggerContainer,
  StaggerItem,
  ScaleUp,
  DrawLine,
  WordReveal,
} from '@/components/Animations';
import TiltCard from '@/components/TiltCard';
import HeroDots from '@/components/HeroDots';
import GradientShift from '@/components/GradientShift';

/* ─── Types ─── */

interface Event {
  id: string;
  title: string;
  start_time: string;
  location_name: string | null;
  ticket_price: number;
  is_members_only: boolean;
}

/* ─── Helpers ─── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.35)',
        marginBottom: '16px',
      }}
    >
      {children}
    </span>
  );
}

/* ─── Data ─── */

const socialPerks = [
  { title: 'Curated Social Events', desc: 'Mixers, happy hours, game nights, and themed socials every single week.' },
  { title: 'Wellness & Adventure', desc: 'Cold plunge, sauna sessions, run clubs, cycling, and outdoor adventures.' },
  { title: 'Priority Access', desc: 'RSVP before the public. Limited spots — members always come first.' },
  { title: 'Real Community', desc: 'An exclusive co-ed group of people you actually want to spend time with.' },
  { title: 'Charlotte Perks', desc: 'Special access and experiences across Charlotte, powered by CLTBucketlist.' },
  { title: 'No Commitment', desc: 'Cancel anytime. No contracts, no cancellation fees, no questions asked.' },
];

const rightForYou = [
  "You just moved to Charlotte and want to find your people fast",
  "You're tired of surface-level apps and want real friendships",
  "You love trying new things — happy hours, wellness, adventures",
  "You want a built-in social circle without the awkward networking",
  "You're a young professional looking for community, not LinkedIn connections",
  "You want to actually enjoy your weekends and weeknights in Charlotte",
];

const valueItems = [
  { category: 'Wellness', example: 'Sauna & Cold Plunge Social', publicPrice: '$45', memberPrice: 'Free' },
  { category: 'Social', example: 'Tap-In Social Happy Hour', publicPrice: '$30', memberPrice: 'Free' },
  { category: 'Community', example: 'Coffee & Connect', publicPrice: '$5', memberPrice: 'Free' },
];

const memberFeatures = [
  '8+ curated events every month',
  'Social mixers & happy hours',
  'Wellness & adventure experiences',
  'Priority RSVP access',
  'Exclusive co-ed community',
  'Digital membership card',
  'Charlotte perks via CLTBucketlist',
  'Cancel anytime — no contracts',
];

const faqs = [
  {
    q: 'What is 704 Social?',
    a: "704 Social is the activity club and social community side of 704 Collective. For $30/month, you get access to 8+ curated events every month — happy hours, wellness experiences, adventure days, game nights, and more. It's your built-in social life in Charlotte.",
  },
  {
    q: 'What kinds of events do you host?',
    a: 'Everything from Coffee & Connect mornings and happy hours to cold plunge & sauna sessions, bowling nights, cooking experiences, run clubs, and themed socials. We host 8+ events per month and are always adding new experiences.',
  },
  {
    q: 'Do I need to apply?',
    a: 'No. 704 Social is open to everyone — just sign up and start attending events. No application, no interview, no waitlist.',
  },
  {
    q: 'How is this different from other social groups?',
    a: "Most social groups in Charlotte are either too big (hundreds of people), too niche, or too transactional. 704 Social events are intentionally kept small (20-40 people), designed for real connection, and span a range of interests. You're not just attending events — you're building a genuine friend group.",
  },
  {
    q: 'Can I bring a friend?',
    a: 'Some events allow guests at a non-member ticket price. Business members automatically get a +1 to every social event. Check each event for guest availability.',
  },
  {
    q: 'What if I want the business side too?',
    a: '704 Business ($300/month) includes everything in Social plus monthly business meetings, keynote speakers, closed-door networking, and strategic introductions. Business members also get a +1 to all social events.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel before your next billing date — no fees, no contracts, no questions.',
  },
];

/* ─── Page ─── */

export default function SocialPage() {
  usePageTitle('704 Social | Charlotte\'s Activity Club & Social Community');
  const router = useRouter();
  const { user } = useAuth();
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const now = new Date().toISOString();
        const thirtyDays = addDays(new Date(), 30).toISOString();
        const { data, error } = await supabase
          .from('events')
          .select('id, title, start_time, location_name, ticket_price, is_members_only')
          .gte('start_time', now)
          .lte('start_time', thirtyDays)
          .order('start_time', { ascending: true })
          .limit(6);
        if (error) throw error;
        setUpcomingEvents(data || []);
      } catch (err) {
        console.error('Error fetching events:', err);
      } finally {
        setEventsLoading(false);
      }
    }
    fetchEvents();
  }, []);

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px' }}>

        {/* ════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════ */}
        <section
          style={{
            minHeight: 'calc(100vh - 64px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '800px',
              height: '800px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <HeroDots />

          <div
            style={{
              position: 'relative',
              maxWidth: '800px',
              margin: '0 auto',
              padding: '80px 24px',
              textAlign: 'center',
            }}
          >
            <FadeIn delay={0.2} duration={0.8}>
              <p
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginBottom: '24px',
                }}
              >
                Charlotte, NC
              </p>
            </FadeIn>

            <h1
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: '#FFFFFF',
                marginBottom: '24px',
              }}
            >
              <WordReveal text="Charlotte's Premier" />
              <br />
              <WordReveal text="Community" />
            </h1>

            <FadeUp delay={0.6} duration={0.8}>
              <p
                style={{
                  fontSize: '1.125rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.6,
                  maxWidth: '540px',
                  margin: '0 auto 12px auto',
                }}
              >
                Your city. Your people.
              </p>
              <p
                style={{
                  fontSize: '1rem',
                  color: 'rgba(255, 255, 255, 0.4)',
                  lineHeight: 1.6,
                  maxWidth: '520px',
                  margin: '0 auto 40px auto',
                }}
              >
                Real friends. Real events. Real connections. No awkward mixers.
              </p>
            </FadeUp>

            <FadeUp delay={0.9} duration={0.7}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
                <Link href="#join" className="btn-primary">
                  Become a Member
                </Link>
                <Link href="#how-it-works" className="btn-ghost">
                  See How It Works
                </Link>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            HOW IT WORKS
        ════════════════════════════════════════════ */}
        <section
          id="how-it-works"
          style={{ backgroundColor: '#1A1A1A', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>How It Works</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '16px',
                }}
              >
                Three simple steps
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: '1.0625rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.65,
                  maxWidth: '500px',
                  margin: '0 auto',
                }}
              >
                No application. No interview. Just sign up and you{"'"}re in.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.15}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px',
                marginTop: '56px',
              }}
              className="how-it-works-grid"
            >
              {[
                {
                  num: '1',
                  title: 'Sign Up',
                  desc: 'Join for $30/month. No application, no waitlist. You\'re in immediately.',
                },
                {
                  num: '2',
                  title: 'Show Up',
                  desc: '8+ events per month. Happy hours, dinners, adventures — we plan everything so you just walk in.',
                },
                {
                  num: '3',
                  title: 'Build Your Circle',
                  desc: 'The people you meet become the friends you text and the network that opens doors.',
                },
              ].map((item, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: '#2E2E2E',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '16px',
                    padding: '40px 28px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: '3rem',
                      fontWeight: 700,
                      color: 'rgba(198, 166, 100, 0.2)',
                      letterSpacing: '-0.05em',
                      marginBottom: '16px',
                      lineHeight: 1,
                    }}
                  >
                    {item.num}
                  </div>
                  <h3
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      marginBottom: '8px',
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.6,
                    }}
                  >
                    {item.desc}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            WHY 704 COLLECTIVE
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#000000', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>Why 704 Collective</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '16px',
                }}
              >
                More than events
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: '1.0625rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.65,
                  maxWidth: '520px',
                  margin: '0 auto',
                }}
              >
                We built the community we wished existed in Charlotte. Here{"'"}s what makes it different.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.08}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginTop: '56px',
              }}
              className="perks-grid"
            >
              {socialPerks.map((item, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '28px 24px',
                    textAlign: 'left',
                    transition: 'all 200ms ease',
                  }}
                  className="card-hover"
                >
                  <h4
                    style={{
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      marginBottom: '8px',
                    }}
                  >
                    {item.title}
                  </h4>
                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.55,
                    }}
                  >
                    {item.desc}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            IS IT RIGHT FOR YOU
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#2E2E2E', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>Is This You?</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '16px',
                }}
              >
                Join 704 If You…
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.08}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                marginTop: '40px',
                textAlign: 'left',
              }}
              className="audience-grid"
            >
              {rightForYou.map((item, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '14px 18px',
                    backgroundColor: 'rgba(26, 26, 26, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                  }}
                >
                  <span style={{ color: '#C6A664', fontSize: '0.875rem', marginTop: '1px', flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '0.875rem', lineHeight: 1.55 }}>
                    {item}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <FadeUp delay={0.4}>
              <Link
                href="#join"
                className="btn-primary"
                style={{ display: 'inline-block', marginTop: '40px', padding: '14px 32px' }}
              >
                Become a Member
              </Link>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            VALUE BREAKDOWN
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#1A1A1A', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>Value</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '12px',
                }}
              >
                Your membership pays for itself
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: '1rem',
                  color: 'rgba(255, 255, 255, 0.5)',
                  lineHeight: 1.6,
                  maxWidth: '500px',
                  margin: '0 auto',
                }}
              >
                Between the wellness perks and the people you{"'"}ll meet, yes. Attending just one event a month justifies the price.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.12}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginTop: '48px',
              }}
              className="how-it-works-grid"
            >
              {valueItems.map((item, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: '#2E2E2E',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '28px 20px',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.35)', marginBottom: '8px' }}>
                    {item.category}
                  </p>
                  <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '16px', lineHeight: 1.4 }}>
                    {item.example}
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.35)', textDecoration: 'line-through', marginBottom: '4px' }}>
                    {item.publicPrice} Public Price
                  </p>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: '#C6A664' }}>
                    Included Free
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <FadeUp delay={0.4}>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.3)', fontStyle: 'italic', marginTop: '24px' }}>
                {'"'}Even if you only make it to Cold Plunge & Sauna night, your membership has already paid for itself.{'"'}
              </p>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            TESTIMONIALS
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#000000', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>What Members Say</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '16px',
                }}
              >
                Don{"'"}t Take Our Word For It
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.15}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
                marginTop: '48px',
              }}
              className="testimonial-grid"
            >
              {[1, 2, 3].map((i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '28px 24px',
                    textAlign: 'left',
                  }}
                >
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255, 255, 255, 0.5)',
                      lineHeight: 1.6,
                      fontStyle: 'italic',
                      marginBottom: '20px',
                    }}
                  >
                    {'"'}Member testimonial coming soon.{'"'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#2E2E2E',
                      }}
                    />
                    <div>
                      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                        Member Name
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.3)' }}>
                        Social Member
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            MEMBERSHIP PRICING
        ════════════════════════════════════════════ */}
        <section
          id="join"
          style={{ backgroundColor: '#1A1A1A', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <FadeUp>
                <SectionLabel>Join</SectionLabel>
              </FadeUp>

              <FadeUp delay={0.1}>
                <h2
                  style={{
                    fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: '#FFFFFF',
                  }}
                >
                  Ready to find your people?
                </h2>
              </FadeUp>
            </div>

            <ScaleUp delay={0.2}>
              <TiltCard
                className="card-hover"
                style={{
                  backgroundColor: '#111111',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '44px 32px',
                  textAlign: 'center',
                }}
              >
                <h3
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginBottom: '4px',
                  }}
                >
                  704 Social
                </h3>
                <div style={{ marginBottom: '28px', marginTop: '8px' }}>
                  <span style={{ fontSize: '2.75rem', fontWeight: 700, color: '#C6A664' }}>
                    $30
                  </span>
                  <span style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '4px' }}>
                    / month
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px 16px',
                    textAlign: 'left',
                    marginBottom: '32px',
                  }}
                  className="pricing-features"
                >
                  {memberFeatures.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
                      <span style={{ color: '#C6A664', fontSize: '0.75rem', flexShrink: 0 }}>✓</span>
                      <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8125rem' }}>{f}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="btn-primary"
                  style={{ display: 'block', textAlign: 'center', padding: '16px 36px', fontSize: '0.9375rem' }}
                >
                  Become a Member
                </Link>

                <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.25)', marginTop: '16px' }}>
                  No app required. Cancel anytime.
                </p>
              </TiltCard>
            </ScaleUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            UPCOMING EVENTS
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#2E2E2E', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <FadeUp>
                <SectionLabel>Events</SectionLabel>
              </FadeUp>

              <FadeUp delay={0.1}>
                <h2
                  style={{
                    fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: '#FFFFFF',
                    marginBottom: '12px',
                  }}
                >
                  {format(new Date(), 'MMMM')} Events
                </h2>
              </FadeUp>
            </div>

            {eventsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ height: '80px', backgroundColor: '#1A1A1A', borderRadius: '12px', animation: 'pulse 2s infinite' }} />
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <FadeUp>
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.9375rem' }}>
                    No upcoming events right now. Check back soon!
                  </p>
                </div>
              </FadeUp>
            ) : (
              <StaggerContainer staggerDelay={0.08}>
                {upcomingEvents.map((event) => {
                  const date = new Date(event.start_time);
                  const dayNum = format(date, 'd');
                  const dayAbbr = format(date, 'EEE');
                  const monthAbbr = format(date, 'MMM').toUpperCase();
                  const time = format(date, 'h:mm a');
                  const isFree = event.ticket_price === 0;

                  return (
                    <StaggerItem
                      key={event.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '20px',
                        padding: '20px 24px',
                        backgroundColor: '#1A1A1A',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '12px',
                        marginBottom: '10px',
                        cursor: 'pointer',
                        transition: 'all 200ms ease',
                      }}
                      className="card-hover"
                      onClick={() => router.push(`/events/${event.id}`)}
                    >
                      {/* Date block */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            textAlign: 'center',
                            minWidth: '44px',
                            flexShrink: 0,
                          }}
                        >
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
                            {dayNum}
                          </div>
                          <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {monthAbbr}
                          </div>
                        </div>

                        {/* Event info */}
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {event.title}
                          </h3>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                              {dayAbbr}, {monthAbbr.charAt(0) + monthAbbr.slice(1).toLowerCase()} {dayNum} • {time}
                            </span>
                            {event.location_name && (
                              <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.35)' }}>
                                📍 {event.location_name}
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: '6px' }}>
                            {isFree ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#C6A664' }}>Free</span>
                            ) : (
                              <>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                                  Non-Member: ${event.ticket_price}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#C6A664', fontWeight: 600, marginLeft: '12px' }}>
                                  Free for Members
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* RSVP button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/events/${event.id}`); }}
                        style={{
                          padding: '8px 20px',
                          backgroundColor: '#2E2E2E',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          color: '#FFFFFF',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 200ms ease',
                        }}
                      >
                        RSVP
                      </button>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            )}

            <FadeUp delay={0.3}>
              <div style={{ textAlign: 'center', marginTop: '32px' }}>
                <Link
                  href="/dashboard/events"
                  className="btn-ghost"
                  style={{ display: 'inline-block', padding: '12px 28px', fontSize: '0.8125rem' }}
                >
                  View All Events →
                </Link>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FAQ
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#000000', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>FAQ</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '16px',
                }}
              >
                Quick answers
              </h2>
            </FadeUp>

            <StaggerContainer staggerDelay={0.1} style={{ marginTop: '40px', textAlign: 'left' }}>
              {faqs.map((item, i) => (
                <StaggerItem key={i}>
                  <details
                    className="faq-item"
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', padding: '20px 0' }}
                  >
                    <summary
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        listStyle: 'none',
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#FFFFFF',
                      }}
                    >
                      {item.q}
                      <span style={{ color: '#C6A664', fontSize: '1.25rem', fontWeight: 300, flexShrink: 0, marginLeft: '16px', transition: 'transform 200ms ease' }}>
                        +
                      </span>
                    </summary>
                    <p style={{ fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.65, marginTop: '12px', paddingRight: '32px' }}>
                      {item.a}
                    </p>
                  </details>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════ */}
        <GradientShift
          style={{ backgroundColor: '#1A1A1A', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <h2
                style={{
                  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: '#FFFFFF',
                  marginBottom: '16px',
                }}
              >
                Ready to find your people?
              </h2>
            </FadeUp>

            <FadeUp delay={0.1}>
              <p
                style={{
                  fontSize: '1.0625rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.65,
                  maxWidth: '500px',
                  margin: '0 auto',
                }}
              >
                Join Charlotte{"'"}s premier community for young professionals. $30/month. Cancel anytime.
              </p>
            </FadeUp>

            <ScaleUp delay={0.2}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', marginTop: '40px' }}>
                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="btn-primary"
                  style={{ padding: '16px 36px', fontSize: '0.9375rem' }}
                >
                  Become a Member
                </Link>
                <a
                  href="mailto:hello@704collective.com"
                  className="btn-ghost"
                  style={{ padding: '16px 36px', fontSize: '0.9375rem' }}
                >
                  Questions? Email Us
                </a>
              </div>
            </ScaleUp>

            <FadeUp delay={0.3}>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.2)', marginTop: '24px' }}>
                Questions? hello@704collective.com
              </p>
            </FadeUp>
          </div>
        </GradientShift>
      </main>
      <Footer />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}