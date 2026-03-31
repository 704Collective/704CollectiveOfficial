'use client';

import { useCallback, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function CheckoutPage() {
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/create-checkout-session', { method: 'POST' });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      throw new Error(data.error);
    }
    return data.clientSecret;
  }, []);

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
            <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)' }}>
              $30/month · Cancel anytime · Instant access
            </p>
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
            <div
              style={{
                borderRadius: '16px',
                overflow: 'hidden',
                border: '1px solid rgba(198, 166, 100, 0.2)',
                backgroundColor: '#FFFFFF',
              }}
            >
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          )}
        </div>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}