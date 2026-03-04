'use client';

import { Mail, Instagram } from 'lucide-react';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  FadeUp,
  FadeIn,
  ScaleUp,
  StaggerContainer,
  StaggerItem,
} from '@/components/Animations';

function TikTokIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

const socials = [
  {
    icon: <Mail style={{ width: '20px', height: '20px' }} />,
    label: 'hello@704collective.com',
    href: 'mailto:hello@704collective.com',
    sub: 'Email us anytime',
  },
  {
    icon: <Instagram style={{ width: '20px', height: '20px' }} />,
    label: '@704_collective',
    href: 'https://www.instagram.com/704_collective/',
    sub: 'Follow on Instagram',
  },
  {
    icon: <TikTokIcon style={{ width: '20px', height: '20px' }} />,
    label: '@704_collective',
    href: 'https://www.tiktok.com/@704_collective',
    sub: 'Follow on TikTok',
  },
];

export default function Contact() {
  usePageTitle('Contact | 704 Collective');

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', backgroundColor: '#000', minHeight: '100vh' }}>

        {/* ── HERO ── */}
        <section style={{ padding: '96px 24px 48px', textAlign: 'center' }}>
          <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            <FadeIn delay={0.15} duration={0.8}>
              <p style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: '20px',
              }}>
                Contact
              </p>
            </FadeIn>

            <FadeUp delay={0.25} duration={0.8}>
              <h1 style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: '#FFFFFF',
                marginBottom: '16px',
              }}>
                Get in Touch
              </h1>
            </FadeUp>

            <FadeUp delay={0.4} duration={0.8}>
              <p style={{
                fontSize: '1.0625rem',
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.65,
              }}>
                Have questions about 704 Collective? We{"'"}d love to hear from you.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* ── CONTACT CARDS ── */}
        <section style={{ padding: '24px 24px 96px' }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <StaggerContainer staggerDelay={0.12}>
              {socials.map((item, i) => (
                <StaggerItem key={i}>
                  <a
                    href={item.href}
                    target={item.href.startsWith('mailto') ? undefined : '_blank'}
                    rel={item.href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '20px',
                      padding: '22px 24px',
                      backgroundColor: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '14px',
                      marginBottom: '12px',
                      textDecoration: 'none',
                      transition: 'border-color 200ms ease, transform 200ms ease',
                    }}
                    className="card-hover"
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(198,166,100,0.08)',
                      border: '1px solid rgba(198,166,100,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#C6A664',
                      flexShrink: 0,
                    }}>
                      {item.icon}
                    </div>
                    <div>
                      <p style={{
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        marginBottom: '2px',
                      }}>
                        {item.label}
                      </p>
                      <p style={{
                        fontSize: '0.8125rem',
                        color: 'rgba(255,255,255,0.35)',
                      }}>
                        {item.sub}
                      </p>
                    </div>
                  </a>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <FadeUp delay={0.5}>
              <p style={{
                fontSize: '0.8125rem',
                color: 'rgba(255,255,255,0.3)',
                textAlign: 'center',
                marginTop: '32px',
                lineHeight: 1.6,
              }}>
                For membership or billing questions, email us and we{"'"}ll get back to you within 24 hours.
              </p>
            </FadeUp>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}