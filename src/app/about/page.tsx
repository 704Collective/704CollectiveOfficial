'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  FadeUp,
  FadeIn,
  StaggerContainer,
  StaggerItem,
  ScaleUp,
} from '@/components/Animations';

const team = [
  { name: 'Adam Gould', title: 'Co-Founder', initials: 'AG' },
  { name: 'Timi Gould', title: 'Co-Founder', initials: 'TG' },
  { name: 'Josh Ahart', title: 'Co-Founder', initials: 'JA' },
  { name: 'Gabbi Baumann', title: 'Co-Founder', initials: 'GB' },
];

const values = [
  {
    title: 'Real Connections',
    desc: 'We don\'t do surface-level. Every event, every interaction is designed to build friendships that last beyond the venue.',
  },
  {
    title: 'Intentionally Small',
    desc: 'Events are capped at 20–40 people so you actually meet everyone. Quality over quantity, always.',
  },
  {
    title: 'Charlotte First',
    desc: 'We\'re built by Charlotte, for Charlotte. Every experience we create supports local venues, businesses, and the community we love.',
  },
];

export default function About() {
  const { user } = useAuth();
  usePageTitle('About | 704 Collective');

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', backgroundColor: '#000' }}>

        {/* ── HERO ── */}
        <section style={{ padding: '96px 24px 80px', textAlign: 'center' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <FadeIn delay={0.15} duration={0.8}>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: '20px',
              }}>
                Charlotte, NC — Est. 2025
              </p>
            </FadeIn>

            <FadeUp delay={0.25} duration={0.8}>
              <h1 style={{
                fontSize: 'clamp(2.25rem, 5.5vw, 3.5rem)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: '#FFFFFF',
                marginBottom: '24px',
              }}>
                About 704 Collective
              </h1>
            </FadeUp>

            <FadeUp delay={0.4} duration={0.8}>
              <p style={{
                fontSize: '1.0625rem',
                color: 'rgba(255,255,255,0.55)',
                lineHeight: 1.75,
                maxWidth: '600px',
                margin: '0 auto',
              }}>
                704 Collective is Charlotte{"'"}s community for young professionals. We create spaces
                for people in their 20s and 30s to build real friendships, grow their networks,
                and get more out of life in the Queen City.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* ── MISSION ── */}
        <section style={{ backgroundColor: '#1A1A1A', padding: '80px 24px' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: '16px',
              }}>
                Our Mission
              </p>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2 style={{
                fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: '#FFFFFF',
                marginBottom: '20px',
              }}>
                Find your people in Charlotte
              </h2>
            </FadeUp>

            <FadeUp delay={0.2}>
              <p style={{
                fontSize: '1rem',
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.75,
              }}>
                Through curated events, shared experiences, and a tight-knit membership community,
                we help you build the connections that matter. Whether you just moved here or you{"'"}ve
                been here for years, 704 Collective is where your social life levels up.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* ── VALUES ── */}
        <section style={{ backgroundColor: '#000', padding: '80px 24px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: '16px',
              }}>
                What We Believe
              </p>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2 style={{
                fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: '#FFFFFF',
                marginBottom: '48px',
              }}>
                Built different, on purpose
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.12}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
              }}
              className="values-grid"
            >
              {values.map((v, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    padding: '36px 28px',
                    textAlign: 'left',
                    transition: 'border-color 200ms ease, transform 200ms ease',
                  }}
                  className="card-hover"
                >
                  <h3 style={{
                    fontSize: '1.0625rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginBottom: '10px',
                  }}>
                    {v.title}
                  </h3>
                  <p style={{
                    fontSize: '0.875rem',
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: 1.65,
                  }}>
                    {v.desc}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ── TEAM ── */}
        <section style={{ backgroundColor: '#1A1A1A', padding: '80px 24px' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
            <FadeUp>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: '16px',
              }}>
                The Team
              </p>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2 style={{
                fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: '#FFFFFF',
                marginBottom: '48px',
              }}>
                Four friends who wanted more from Charlotte
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.1}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px',
              }}
              className="team-grid"
            >
              {team.map((member) => (
                <StaggerItem
                  key={member.name}
                  style={{
                    backgroundColor: '#2E2E2E',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    padding: '32px 16px 28px',
                    textAlign: 'center',
                    transition: 'border-color 200ms ease, transform 200ms ease',
                  }}
                  className="card-hover"
                >
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(198,166,100,0.08)',
                    border: '1px solid rgba(198,166,100,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <span style={{
                      fontSize: '1.125rem',
                      fontWeight: 700,
                      color: '#C6A664',
                      letterSpacing: '-0.02em',
                    }}>
                      {member.initials}
                    </span>
                  </div>
                  <h3 style={{
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginBottom: '4px',
                  }}>
                    {member.name}
                  </h3>
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.4)',
                  }}>
                    {member.title}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ── CTA ── */}
        {!user && (
          <section style={{ backgroundColor: '#000', padding: '96px 24px' }}>
            <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
              <ScaleUp delay={0.1}>
                <div style={{
                  backgroundColor: '#111',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  padding: '56px 40px',
                }}>
                  <h2 style={{
                    fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: '#FFFFFF',
                    marginBottom: '12px',
                  }}>
                    Ready to join?
                  </h2>
                  <p style={{
                    fontSize: '1rem',
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: 1.65,
                    maxWidth: '420px',
                    margin: '0 auto 32px',
                  }}>
                    Get unlimited access to all events and become part of Charlotte{"'"}s
                    most active professional community.
                  </p>
                  <Link
                    href="/social"
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 32px' }}
                  >
                    Join 704 Collective <ArrowRight style={{ width: '16px', height: '16px' }} />
                  </Link>
                </div>
              </ScaleUp>
            </div>
          </section>
        )}
      </main>
      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .values-grid { grid-template-columns: 1fr !important; }
          .team-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}