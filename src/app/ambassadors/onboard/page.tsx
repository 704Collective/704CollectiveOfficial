'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';
import { createMyOnboardingLink } from '@/app/actions/ambassadorActions';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

export default function AmbassadorOnboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace('/ambassadors/login');
        return;
      }

      // 2. Ambassador check
      const { data: amb } = await supabase
        .from('ambassadors')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!amb) {
        await supabase.auth.signOut();
        router.replace('/ambassadors/login');
        return;
      }

      // 3. Generate onboarding link
      const result = await createMyOnboardingLink();
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // 4. Redirect to Stripe
      window.location.href = result.url;
    })();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <>
      <Nav />
      <MarketingPageRoot>
        <div style={{
          minHeight: '100dvh',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          paddingTop: '80px',
        }}>
          <div style={{ width: '100%', maxWidth: '440px' }}>

            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
                <img src="/logo-nav.svg" alt="704 Collective" width={40} height={40} />
                <span style={{ color: '#FFFFFF', fontSize: 'clamp(1.25rem, 5vw, 1.5rem)', fontWeight: 600 }}>
                  704 Collective
                </span>
              </Link>
            </div>

            {loading && !error ? (
              /* Loading state */
              <div style={{
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: 'clamp(32px, 6vw, 48px) clamp(24px, 5vw, 36px)',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '48px', height: '48px',
                  border: '3px solid rgba(198,166,100,0.15)',
                  borderTopColor: '#C6A664',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 24px',
                }} />
                <h1 style={{ margin: '0 0 10px', fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Setting up your Stripe Connect onboarding…
                </h1>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  You&apos;ll be redirected to Stripe in a moment.
                </p>
              </div>
            ) : (
              /* Error state */
              <div style={{
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '16px',
                padding: 'clamp(32px, 6vw, 48px) clamp(24px, 5vw, 36px)',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '48px', height: '48px',
                  background: 'rgba(239,68,68,0.1)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h1 style={{ margin: '0 0 10px', fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Something Went Wrong
                </h1>
                <p style={{ margin: '0 0 28px', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  {error}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                  <Link
                    href="/ambassadors/dashboard"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '100%', padding: '13px',
                      background: '#C6A664', color: '#1A1A1A',
                      borderRadius: '8px', fontSize: '0.9375rem', fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Back to Dashboard
                  </Link>
                  <a
                    href="mailto:hello@704collective.com?subject=Stripe%20Connect%20Onboarding%20Issue"
                    style={{
                      fontSize: '0.875rem',
                      color: 'rgba(255,255,255,0.35)',
                      textDecoration: 'none',
                    }}
                  >
                    Email Support
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </MarketingPageRoot>
    </>
  );
}