'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import Nav from '@/components/Nav';

export default function PendingReviewPage() {
  const { profile, loading, signOut } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // If no profile or not actually pending, redirect appropriately
    if (!profile) {
      router.replace('/login');
      return;
    }
    if (profile.application_status === 'accepted') {
      router.replace('/dashboard');
      return;
    }
    if (profile.application_status === 'denied') {
      router.replace('/login?error=application_denied');
      return;
    }
  }, [profile, loading, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <>
      <Nav />
      <main
        style={{
          paddingTop: '64px',
          backgroundColor: '#0d0d0d',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            padding: '0 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '32px',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: 'rgba(198,166,100,0.12)',
              border: '1px solid rgba(198,166,100,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock style={{ width: '36px', height: '36px', color: '#C6A664' }} />
          </div>

          {/* Text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h1
              style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: '#FFFFFF',
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              Hey {firstName}, you&apos;re on deck.
            </h1>
            <p
              style={{
                fontSize: '1rem',
                color: 'rgba(255,255,255,0.55)',
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              Your application is under review. Our team will be in touch
              shortly — typically within a few business days.
            </p>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          />

          {/* What happens next */}
          <div style={{ width: '100%', textAlign: 'left' }}>
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#C6A664',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '16px',
              }}
            >
              What happens next
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { step: '01', text: 'Our founders review your application' },
                { step: '02', text: 'We may reach out for a quick conversation' },
                { step: '03', text: "Once approved, you'll be charged and granted full access" },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#C6A664',
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: '24px',
                      paddingTop: '2px',
                    }}
                  >
                    {step}
                  </span>
                  <span style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          />

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <a
              href="mailto:adam@cltbucketlist.com"
              style={{
                display: 'block',
                width: '100%',
                padding: '12px 24px',
                backgroundColor: 'rgba(198,166,100,0.12)',
                border: '1px solid rgba(198,166,100,0.3)',
                borderRadius: '8px',
                color: '#C6A664',
                fontSize: '0.9375rem',
                fontWeight: 600,
                textDecoration: 'none',
                textAlign: 'center',
                transition: 'background-color 0.2s',
              }}
            >
              Questions? Reach out
            </a>
            <Button
              variant="ghost"
              onClick={handleSignOut}
              style={{ width: '100%', color: 'rgba(255,255,255,0.35)', fontSize: '0.875rem' }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}