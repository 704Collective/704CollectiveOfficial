'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SOCIAL_TIER } from '@/lib/pricing';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { PromoCodeField } from '@/components/PromoCodeField';
import { supabase } from '@/integrations/supabase/client';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const promoInputStyle: React.CSSProperties = {
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

export default function CheckoutPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // The embedded session is minted with its discount baked in, so the code has
  // to be resolved before the checkout mounts. Holding the secret in state lets
  // an applied code re-mint the session instead of editing a live one.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [promoCodeError, setPromoCodeError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Referral pricing is decided entirely by the server from the member's own
  // profile; the page never claims it. Rendering from the same response that
  // minted the session is what keeps the shown price and the charged price
  // from drifting apart.
  const [referralApplied, setReferralApplied] = useState(false);

  // Password-first enforcement: the embedded checkout requires an account, so
  // logged-out visitors (e.g. from emailed /join/checkout links) go create one.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session) {
        router.replace('/signup');
        return;
      }
      setAuthChecked(true);
    });
    return () => { cancelled = true; };
  }, [router]);

  const createSession = useCallback(
    async (code: string): Promise<'ok' | 'invalid' | 'error'> => {
      try {
        const res = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(code ? { promoCode: code } : {}),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          // A bad code is the member's problem to fix inline; anything else is
          // ours and takes over the page.
          if (data.error === 'invalid_promo_code') return 'invalid';
          setError(data.error || 'Failed to start checkout');
          return 'error';
        }
        setClientSecret(data.clientSecret);
        setReferralApplied(Boolean(data.referral?.applied));
        return 'ok';
      } catch {
        setError('Failed to start checkout');
        return 'error';
      }
    },
    [],
  );

  // Mint the opening full-price session once auth clears.
  useEffect(() => {
    if (!authChecked) return;
    void createSession('');
  }, [authChecked, createSession]);

  const handlePromoApply = useCallback(async () => {
    const trimmed = promoCodeInput.trim();
    setPromoCodeError(null);
    setApplying(true);
    const outcome = await createSession(trimmed);
    setApplying(false);
    if (outcome === 'invalid') {
      setPromoCodeError("That code isn't valid or has expired");
      return;
    }
    if (outcome === 'ok') setAppliedPromoCode(trimmed);
  }, [promoCodeInput, createSession]);

  // Collapsing the disclosure drops the code, which means re-minting at full
  // price so the mounted checkout can never disagree with the badge.
  const handlePromoDismiss = useCallback(() => {
    setPromoCodeInput('');
    setPromoCodeError(null);
    if (appliedPromoCode) {
      setAppliedPromoCode('');
      void createSession('');
    }
  }, [appliedPromoCode, createSession]);

  const handlePromoInputChange = useCallback((next: string) => {
    setPromoCodeInput(next);
    setPromoCodeError(null);
  }, []);

  // Don't mount the checkout (which immediately requests a session) until the
  // auth check has passed; logged-out visitors are redirected above.
  if (!authChecked) {
    return (
      <>
        <Nav />
        <main
          id="main-content"
          style={{ paddingTop: '64px', minHeight: '100vh', backgroundColor: '#000000' }}
        />
        <Footer />
      </>
    );
  }

  return (
    <>
      <Nav />
      <main id="main-content" 
        style={{
          paddingTop: '64px',
          minHeight: '100vh',
          backgroundColor: '#000000',
        }}
      >
        <MarketingPageRoot>
        <div
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            padding: '48px 24px 80px',
          }}
        >
          {/* Back link */}
          <Link
            href="/join"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.875rem',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              marginBottom: '32px',
              transition: 'color 200ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
          >
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Back
          </Link>

          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#C6A664',
                marginBottom: '8px',
              }}
            >
              Social Membership
            </p>
            <h1
              style={{
                fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
                fontWeight: 700,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
                marginBottom: '8px',
              }}
            >
              Join 704 Collective
            </h1>
            <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)' }} data-testid="price-line">
              {referralApplied ? (
                <>
                  <span style={{ textDecoration: 'line-through', opacity: 0.5, marginRight: '0.5rem' }}>
                    {SOCIAL_TIER.monthlyPrice}
                  </span>
                  <span style={{ color: '#C6A664', fontWeight: 700 }}>$35</span>
                  <span>/month</span>
                </>
              ) : (
                SOCIAL_TIER.monthlyPriceFull
              )}
              {' · Cancel anytime · Instant access'}
            </p>
            {referralApplied && (
              <p
                style={{ fontSize: '0.875rem', color: '#C6A664', margin: '4px 0 0' }}
                data-testid="referral-caption"
              >
                Referral rate - locked in for life
              </p>
            )}
          </div>

          {/* Gold divider */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(90deg, #C6A664, transparent)',
              marginBottom: '32px',
              opacity: 0.4,
            }}
          />

          {/* Stripe Embedded Checkout */}
          {error ? (
            <div
              style={{
                padding: '32px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: '#1A1A1A',
                textAlign: 'center',
              }}
            >
              <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
                Something went wrong loading checkout. Please try again.
              </p>
              <button
                onClick={() => { setError(null); window.location.reload(); }}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Sits above the checkout because the session is minted with the
                  discount already applied; applying a code re-mints it. Hidden
                  under referral pricing: referral wins and codes do not stack,
                  same rule the /join form applies. */}
              {!referralApplied && (
                <div style={{ marginBottom: '20px' }} data-testid="promo-field">
                  <PromoCodeField
                    value={promoCodeInput}
                    onValueChange={handlePromoInputChange}
                    appliedCode={appliedPromoCode}
                    onApply={handlePromoApply}
                    onDismiss={handlePromoDismiss}
                    error={promoCodeError}
                    inputStyle={promoInputStyle}
                    applying={applying}
                    appliedNote="Discount applied below. Collapse this to checkout at full price."
                  />
                </div>
              )}
              <div
                style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '1px solid rgba(198, 166, 100, 0.2)',
                  backgroundColor: '#FFFFFF',
                }}
              >
                {clientSecret && (
                  <EmbeddedCheckoutProvider
                    key={clientSecret}
                    stripe={stripePromise}
                    options={{ clientSecret }}
                  >
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                )}
              </div>
            </>
          )}
        </div>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}