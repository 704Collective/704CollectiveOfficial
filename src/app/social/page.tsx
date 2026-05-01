'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SOCIAL_TIER } from '@/lib/pricing';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import {
  FadeUp,
  StaggerContainer,
  StaggerItem,
  ScaleUp,
  WordReveal,
} from '@/components/Animations';
import TiltCard from '@/components/TiltCard';
import GradientShift from '@/components/GradientShift';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import JsonLd from '@/components/JsonLd';
import { socialServiceSchema704 } from '@/lib/jsonLdSchemas';
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

const communityPillars = [
  {
    title: 'Intentionally Small',
    desc: 'Other Charlotte groups host 600-1,200 person events. We keep it to 20-40 people so you actually get to know someone.',
  },
  {
    title: 'No Awkward Networking',
    desc: 'No name tags. No elevator pitches. Just real conversations in great spaces with people you\'d actually want to grab a drink with.',
  },
  {
    title: 'Charlotte-First',
    desc: 'Born from CLTBucketlist — Charlotte\'s most trusted lifestyle brand with 500,000+ community members. We know this city.',
  },
];

const rightForYou = [
  'Are new to Charlotte and don\'t have a solid friend group yet',
  'Have friends but need things to actually do together',
  'Are tired of surface-level bar conversations that go nowhere',
  'Want to DO stuff, not just talk about doing stuff',
  'Tried the free 600-person meetups and felt overwhelmed',
  'Want real friends, not LinkedIn connections',
  'Need variety more than just bars on a Friday night — coffee meetups, game nights, workouts, adventures',
  `Most events in Charlotte cost $15-25. We're doing 10+ for ${SOCIAL_TIER.monthlyPrice}`,
];

const valueItems = [
  { category: 'WELLNESS', example: 'Cold Plunge & Sauna', publicPrice: '$45', memberPrice: 'Free' },
  { category: 'SOCIAL', example: 'Appetizer & Entry', publicPrice: '$30', memberPrice: 'Free' },
  { category: 'COMMUNITY', example: 'Coffee Meetup', publicPrice: '$5', memberPrice: 'Free' },
];

const memberFeatures = [
  '10+ events every month',
  'Priority RSVP access',
  'Happy hours & socials',
  'Wellness & workout days',
  'Digital membership card',
  'Cancel anytime',
];

/* ─── Page ─── */

export default function SocialPage() {
  usePageTitle('704 Social | Charlotte\'s Activity Club & Social Community');
  const { isActiveMember } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <JsonLd schema={socialServiceSchema704} />
      <Nav />
      <main id="main-content" style={{ paddingTop: 'calc(64px + var(--banner-height, 0px))' }}>
        <MarketingPageRoot>

        {/* ════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════ */}
        <section
          style={{
            minHeight: 'calc(100dvh - 64px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background photo */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: "url('/social-hero.jpg')",
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
              transform: 'scale(1.04)',
              transition: 'transform 8s ease-out',
            }}
          />

          {/* Dark overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0.82) 100%)',
            }}
          />

          {/* Vignette */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              maxWidth: '800px',
              margin: '0 auto',
              padding: '80px 24px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
                marginBottom: '24px',
              }}
            >
              704 COLLECTIVE · SOCIAL MEMBERSHIP
            </p>

            <h1
              style={{
                fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: '#FFFFFF',
                marginBottom: '16px',
              }}
            >
              <WordReveal text="YOUR SOCIAL LIFE, HANDLED." />
            </h1>

            <FadeUp delay={0.5} duration={0.8}>
              <p
                style={{
                  fontSize: '1.125rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  marginBottom: '12px',
                }}
              >
                Charlotte&apos;s Community for Young Professionals
              </p>
              <p
                style={{
                  fontSize: '1rem',
                  color: 'rgba(255, 255, 255, 0.45)',
                  maxWidth: '520px',
                  margin: '0 auto 40px auto',
                }}
              >
                10+ curated events every month. Happy hours, dinners, wellness days, outdoor adventures, and member-only experiences — all planned for you. No application needed. Just join, show up, and meet your people.
              </p>
            </FadeUp>

            <FadeUp delay={0.9} duration={0.7}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
                <Link href="/join?plan=social" className="btn-primary">
                  BECOME A MEMBER
                </Link>
                <Link href="/events" className="btn-ghost">
                  VIEW EVENTS
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
              <SectionLabel>HOW IT WORKS</SectionLabel>
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
                THREE SIMPLE STEPS
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
                No application. No interviews. Just sign up and you&apos;re in.
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
                  title: 'Join',
                  desc: 'No application. No interviews. Just sign up and you\'re in.',
                },
                {
                  num: '2',
                  title: 'Show Up',
                  desc: '10+ events per month. Happy hours, dinners, adventures — we plan everything so you just walk in.',
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
            THE COMMUNITY
        ════════════════════════════════════════════ */}
        <section
          style={{ backgroundColor: '#000000', padding: '96px 24px' }}
        >
          <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <SectionLabel>THE COMMUNITY</SectionLabel>
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
                REAL PEOPLE. REAL FRIENDSHIPS.
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: '1.0625rem',
                  color: 'rgba(255, 255, 255, 0.55)',
                  lineHeight: 1.65,
                  maxWidth: '600px',
                  margin: '0 auto 48px auto',
                }}
              >
                Founders, creatives, tech professionals, finance people, stay-at-home parents, couples, bartenders — and everything in between. Some are Charlotte natives, some moved here last year. What they have in common: they&apos;re intentional about building real relationships.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.08}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
              }}
              className="perks-grid"
            >
              {communityPillars.map((item, i) => (
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
              <SectionLabel>IS 704 RIGHT FOR YOU?</SectionLabel>
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
                JOIN 704 IF YOU...
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
                href="/join?plan=social"
                className="btn-primary"
                style={{ display: 'inline-block', marginTop: '40px', padding: '14px 32px' }}
              >
                BECOME A MEMBER
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
              <SectionLabel>IS IT WORTH IT?</SectionLabel>
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
                YOUR MEMBERSHIP PAYS FOR ITSELF
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
                Between the wellness perks and the people you&apos;ll meet, yes. Attending just one event a month justifies the price.
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
                &ldquo;Even if you only make it to Cold Plunge &amp; Sauna night, your membership has already paid for itself.&rdquo;
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
              <SectionLabel>WHAT MEMBERS SAY</SectionLabel>
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
                DON&apos;T TAKE OUR WORD FOR IT
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.15}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '20px',
                marginTop: '48px',
              }}
              className="testimonial-grid"
            >
              {[
                {
                  quote: '704 makes it so easy to hit fun events — especially the health and wellness ones, my personal fave — and I get to meet so many new people every time!!',
                  name: 'Sydney',
                  role: 'Social Member',
                  avatar: 'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/Sydney.jpg',
                },
                {
                  quote: "Joining 704 was a great decision, there's so many events and everyone I've met has been great.",
                  name: 'Nick',
                  role: 'Social Member',
                  avatar: 'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/Nick.jpg',
                },
              ].map((item, i) => (
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
                      color: 'rgba(255, 255, 255, 0.65)',
                      lineHeight: 1.65,
                      fontStyle: 'italic',
                      marginBottom: '20px',
                    }}
                  >
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Image
                      src={item.avatar}
                      alt={item.name}
                      width={36}
                      height={36}
                      style={{ borderRadius: '50%', objectFit: 'cover', width: '36px', height: '36px', flexShrink: 0 }}
                      unoptimized
                    />
                    <div>
                      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#FFFFFF' }}>
                        {item.name}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.3)' }}>
                        {item.role}
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
                <SectionLabel>MEMBERSHIP INVESTMENT</SectionLabel>
              </FadeUp>

              <FadeUp delay={0.1}>
                <h2
                  style={{
                    fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: '#FFFFFF',
                    marginBottom: '8px',
                  }}
                >
                  SIMPLE, TRANSPARENT PRICING
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p style={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.55)', marginBottom: '40px' }}>
                  One membership. Full access. No commitments.
                </p>
              </FadeUp>
            </div>

            <ScaleUp delay={0.2}>
              <TiltCard
                className="card-hover"
                style={{
                  backgroundColor: '#111111',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: 'clamp(28px, 6vw, 44px) clamp(20px, 5vw, 32px)',
                  textAlign: 'center',
                }}
              >
                <p
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.35)',
                    marginBottom: '8px',
                  }}
                >
                  MONTHLY
                </p>
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
                <div style={{ marginBottom: '4px', marginTop: '8px' }}>
                  <span style={{ fontSize: '2.75rem', fontWeight: 700, color: '#C6A664' }}>
                    {SOCIAL_TIER.monthlyPrice}
                  </span>
                  <span style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.4)', marginLeft: '4px' }}>
                    / month
                  </span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>
                  Cancel anytime
                </p>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', marginBottom: '28px' }}>
                  Full access, no commitments
                </p>

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
                  href={mounted && isActiveMember ? '/dashboard' : '/join?plan=social'}
                  className="btn-primary"
                  style={{ display: 'block', textAlign: 'center', padding: '16px 36px', fontSize: '0.9375rem' }}
                >
                  BECOME A MEMBER
                </Link>

                <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.25)', marginTop: '16px' }}>
                  No application required.
                </p>
              </TiltCard>
            </ScaleUp>
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
              <SectionLabel>READY?</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.05}>
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
                YOUR CITY. YOUR PEOPLE.
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
                Stop scrolling. Start showing up.
              </p>
            </FadeUp>

            <ScaleUp delay={0.2}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center', marginTop: '40px' }}>
                <Link
                  href={mounted && isActiveMember ? '/dashboard' : '/join?plan=social'}
                  className="btn-primary"
                  style={{ padding: '16px 36px', fontSize: '0.9375rem' }}
                >
                  BECOME A MEMBER
                </Link>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', marginTop: '16px' }}>
                Questions? hello@704collective.com
              </p>
            </ScaleUp>
          </div>
        </GradientShift>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
