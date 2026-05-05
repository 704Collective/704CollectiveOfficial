'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { Loader2 } from 'lucide-react';

interface Ambassador {
  id: string;
  full_name: string;
}

// ── Social tier benefits shown on the referral page ──────────────
const SOCIAL_BENEFITS = [
  'Monthly curated social events',
  'Access to the member directory & feed',
  'Priority event registration',
  'Founding member rate — locked in for life',
];

// ── Business tier benefits shown on the referral page ─────────────
const BUSINESS_BENEFITS = [
  'Everything in Social, plus:',
  'Quarterly private business dinners',
  'Warm introductions via the collective',
  'Business member spotlight opportunities',
  'Founding rate locked through 2026',
];

function ReferralPageInner() {
  const searchParams = useSearchParams();

  const [codeInput, setCodeInput] = useState('');
  const [resolvedAmbassador, setResolvedAmbassador] = useState<Ambassador | null>(null);
  const [appliedCode, setAppliedCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateCode = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) {
      setError('Please enter a referral code.');
      return;
    }

    setValidating(true);
    setError(null);
    setResolvedAmbassador(null);

    const { data, error: rpcError } = await supabase.rpc('get_ambassador_by_code', {
      p_code: code,
    });

    setValidating(false);

    if (rpcError || !data || (data as unknown[]).length === 0) {
      setError('Invalid or inactive referral code. Please check and try again.');
      return;
    }

    const ambassador = (data as Ambassador[])[0];
    setResolvedAmbassador({ id: ambassador.id, full_name: ambassador.full_name });
    setAppliedCode(code);
    setError(null);
  }, []);

  // Auto-validate ?code= URL param on mount
  useEffect(() => {
    const codeFromUrl = searchParams.get('code')?.trim();
    if (!codeFromUrl) return;
    const upper = codeFromUrl.toUpperCase();
    setCodeInput(upper);
    void validateCode(upper);
  }, [searchParams, validateCode]);

  // ── STATE B — Validating ─────────────────────────────────────────
  if (validating) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
        <Nav />
        <MarketingPageRoot>
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Checking your code...</p>
            </div>
          </div>
        </MarketingPageRoot>
        <Footer />
      </div>
    );
  }

  // ── STATE C — Code valid ─────────────────────────────────────────
  if (resolvedAmbassador) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
        <Nav />
        <MarketingPageRoot>
          <div
            className="flex-1 px-4 py-16"
            style={{ paddingTop: 'calc(64px + var(--banner-height, 0px) + 2rem)' }}
          >
            <div className="max-w-2xl mx-auto space-y-10">

              {/* Header */}
              <div className="text-center space-y-3">
                <p
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: '#C6A664' }}
                >
                  You&apos;ve Been Referred
                </p>
                <h1
                  className="text-3xl sm:text-4xl font-bold"
                  style={{ color: '#FAF6F0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {resolvedAmbassador.full_name} thinks you&apos;d love 704 Collective.
                </h1>
                <p className="text-base" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Your referral code unlocks founding member rates — claimed below.
                </p>
              </div>

              {/* CTA cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                {/* Social card */}
                <div
                  className="rounded-2xl border flex flex-col"
                  style={{
                    backgroundColor: '#232323',
                    borderColor: 'rgba(198,166,100,0.25)',
                    padding: '28px 24px',
                  }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-1"
                    style={{ color: '#C6A664' }}
                  >
                    704 Social
                  </p>
                  <div className="mb-4">
                    <span
                      className="text-sm line-through"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      $49/month
                    </span>
                    <div
                      className="text-3xl font-bold mt-0.5"
                      style={{ color: '#FAF6F0' }}
                    >
                      $35<span className="text-base font-normal" style={{ color: 'rgba(255,255,255,0.55)' }}>/month</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#C6A664' }}>
                      Founding rate — locked in for life
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    {SOCIAL_BENEFITS.map(b => (
                      <li key={b} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <span style={{ color: '#C6A664', marginTop: '2px' }}>✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/join?ref=${appliedCode}`}
                    className="block w-full text-center rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#C6A664', color: '#1A1A1A' }}
                  >
                    Join Social →
                  </Link>
                </div>

                {/* Business card */}
                <div
                  className="rounded-2xl border flex flex-col"
                  style={{
                    backgroundColor: '#232323',
                    borderColor: 'rgba(198,166,100,0.25)',
                    padding: '28px 24px',
                  }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-1"
                    style={{ color: '#C6A664' }}
                  >
                    704 Business
                  </p>
                  <div className="mb-4">
                    <span
                      className="text-sm line-through"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                    >
                      $300/month
                    </span>
                    <div
                      className="text-3xl font-bold mt-0.5"
                      style={{ color: '#FAF6F0' }}
                    >
                      $250<span className="text-base font-normal" style={{ color: 'rgba(255,255,255,0.55)' }}>/month</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#C6A664' }}>
                      Founding rate — locked through 2026
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    {BUSINESS_BENEFITS.map(b => (
                      <li key={b} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <span style={{ color: '#C6A664', marginTop: '2px' }}>✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/apply/business?ref=${appliedCode}`}
                    className="block w-full text-center rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'transparent', color: '#C6A664', border: '1.5px solid #C6A664' }}
                  >
                    Apply for Business →
                  </Link>
                </div>

              </div>

              {/* Attribution footer */}
              <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Your referral code: <span style={{ color: 'rgba(255,255,255,0.55)' }}>{appliedCode}</span>
                {' '}•{' '}
                Referred by <span style={{ color: 'rgba(255,255,255,0.55)' }}>{resolvedAmbassador.full_name}</span>
              </p>

              {/* Ambassador login */}
              <p className="text-center" style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', marginTop: '32px' }}>
                Already an ambassador?{' '}
                <Link href="/ambassadors/login" style={{ color: '#C6A664' }} className="hover:underline">
                  Log in here
                </Link>
              </p>

            </div>
          </div>
        </MarketingPageRoot>
        <Footer />
      </div>
    );
  }

  // ── STATE A — Enter code ─────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
      <Nav />
      <MarketingPageRoot>
        <div
          className="flex-1 flex items-center justify-center px-4 py-16"
          style={{ paddingTop: 'calc(64px + var(--banner-height, 0px) + 2rem)' }}
        >
          <div className="w-full max-w-md space-y-8 text-center">

            {/* Header */}
            <div className="space-y-3">
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#C6A664' }}
              >
                Referral
              </p>
              <h1
                className="text-3xl font-bold"
                style={{ color: '#FAF6F0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Have a referral code?
              </h1>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Enter your friend&apos;s code below to unlock founding member rates.
              </p>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter code"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') void validateCode(codeInput); }}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    backgroundColor: '#2A2A2A',
                    border: error ? '1.5px solid #ef4444' : '1.5px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    color: '#FAF6F0',
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void validateCode(codeInput)}
                  disabled={validating || !codeInput.trim()}
                  style={{
                    padding: '0 22px',
                    backgroundColor: validating || !codeInput.trim() ? 'rgba(198,166,100,0.4)' : '#C6A664',
                    color: '#1A1A1A',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: validating || !codeInput.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  Apply
                </button>
              </div>
              {error && (
                <p className="text-sm text-left" style={{ color: '#ef4444' }}>{error}</p>
              )}
            </div>

            {/* No code fallback */}
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              No code?{' '}
              <Link href="/join" style={{ color: 'rgba(255,255,255,0.55)' }} className="hover:underline">
                Join Social
              </Link>
              {' '}or{' '}
              <Link href="/apply/business" style={{ color: 'rgba(255,255,255,0.55)' }} className="hover:underline">
                Apply for Business
              </Link>
              {' '}at our standard rates.
            </p>

            {/* Ambassador login */}
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: '32px' }}>
              Already an ambassador?{' '}
              <Link href="/ambassadors/login" style={{ color: '#C6A664' }} className="hover:underline">
                Log in here
              </Link>
            </p>

          </div>
        </div>
      </MarketingPageRoot>
      <Footer />
    </div>
  );
}

export default function ReferralPage() {
  return (
    <Suspense>
      <ReferralPageInner />
    </Suspense>
  );
}