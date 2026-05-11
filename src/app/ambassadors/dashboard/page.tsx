'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { getMyStripeAccountStatus } from '@/app/actions/ambassadorActions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AmbassadorRow {
  id: string;
  full_name: string;
  referral_code: string;
  stripe_account_id: string | null;
  stripe_account_status: string | null;
  social_reward_cents: number;
  business_reward_cents: number;
}

interface ReferralRow {
  id: string;
  referred_full_name: string | null;
  referred_email: string | null;
  tier: string | null;
  status: string;
  reward_cents: number | null;
  converted_at: string | null;
  created_at: string;
  paid_out_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PAID_STATUSES = new Set(['approved', 'auto_approved', 'converted', 'paid_out']);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${highlight ? 'rgba(198,166,100,0.35)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '14px',
      padding: '20px',
    }}>
      <p style={{ margin: '0 0 8px', fontSize: '0.625rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 'clamp(1.375rem, 3vw, 1.875rem)', fontWeight: 700, color: highlight ? '#C6A664' : '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    signed_up:    { label: 'Signed Up',     bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
    converted:    { label: 'Converted',     bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
    approved:     { label: 'Approved',      bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
    auto_approved:{ label: 'Approved',      bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
    paid_out:     { label: 'Paid Out',      bg: 'rgba(34,197,94,0.08)',   color: '#4ade80' },
    churned:      { label: 'Churned',       bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' },
    denied:       { label: 'Denied',        bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
    pending:      { label: 'Pending Review',bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
    flagged_self_refer: { label: 'Flagged', bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
  };
  const s = map[status] ?? { label: status, bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' };
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '100px', background: s.bg, color: s.color, fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  const isBusiness = tier === 'business';
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '100px', background: isBusiness ? 'rgba(59,130,246,0.15)' : 'rgba(198,166,100,0.15)', color: isBusiness ? '#60a5fa' : '#C6A664', fontSize: '0.75rem', fontWeight: 600 }}>
      {isBusiness ? 'Business' : 'Social'}
    </span>
  );
}

function StripeStatusCard({ status, accountId }: { status: string | null; accountId: string | null }) {
  if (status === 'active') {
    return (
      <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '0.9375rem', fontWeight: 600, color: '#4ade80' }}>Stripe Connect is set up</p>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>
            You&apos;ll receive weekly payouts every Monday.
            {accountId && <span style={{ display: 'block', marginTop: '4px', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)' }}>acct_…{accountId.slice(-8)}</span>}
          </p>
        </div>
      </div>
    );
  }

  const isRestricted = status === 'restricted';
  const hasOnboarding = status === 'onboarding' || status === 'pending';

  const icon = isRestricted ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  const borderColor = isRestricted ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)';
  const bgColor = isRestricted ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)';
  const headingColor = isRestricted ? '#f87171' : '#fbbf24';
  const heading = isRestricted ? 'Setup needs attention' : hasOnboarding ? 'Setup in progress' : "You haven't set up Stripe Connect yet";
  const body = isRestricted
    ? 'Stripe needs more information from you before you can receive payouts.'
    : hasOnboarding
    ? 'Finish setting up your Stripe Connect account so we can send you payouts.'
    : 'Set up Stripe Connect now so you can receive weekly payouts when your referrals convert.';
  const btnLabel = isRestricted ? 'Update Stripe Info' : hasOnboarding ? 'Continue Stripe Setup' : 'Set Up Stripe Connect';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
      {icon}
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 4px', fontSize: '0.9375rem', fontWeight: 600, color: headingColor }}>{heading}</p>
        <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>{body}</p>
        <Link href="/ambassadors/onboard" style={{
          display: 'inline-flex', alignItems: 'center', padding: '9px 18px',
          background: '#C6A664', color: '#1A1A1A', borderRadius: '7px',
          fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none',
        }}>
          {btnLabel}
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function AmbassadorDashboardPage() {
  const router = useRouter();
  const [ambassador, setAmbassador] = useState<AmbassadorRow | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAlsoMember, setIsAlsoMember] = useState(false);
  const [stripeReqs, setStripeReqs] = useState<string[]>([]);
  const [reqsLoading, setReqsLoading] = useState(false);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/ambassadors/login'); return; }

    const { data: amb } = await supabase
      .from('ambassadors')
      .select('id, full_name, referral_code, stripe_account_id, stripe_account_status, social_reward_cents, business_reward_cents')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!amb) {
      await supabase.auth.signOut();
      router.push('/ambassadors/login');
      return;
    }

    const { data: refs } = await supabase
      .from('ambassador_referrals')
      .select('id, referred_full_name, referred_email, tier, status, reward_cents, converted_at, created_at, paid_out_at')
      .eq('ambassador_id', amb.id)
      .order('created_at', { ascending: false })
      .order('created_at', { ascending: false });

    const { data: profileData } = await supabase
      .from('profiles')
      .select('member_type, subscription_status')
      .eq('id', user.id)
      .maybeSingle();

    if (profileData) {
      const isPayingMember =
        ['social', 'business'].includes(profileData.member_type ?? '') &&
        ['active', 'trialing'].includes(profileData.subscription_status ?? '');
      setIsAlsoMember(isPayingMember);
    }

    setAmbassador(amb as AmbassadorRow);
    setReferrals((refs ?? []) as ReferralRow[]);
    setLoading(false);
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!ambassador) return;
    if (!ambassador.stripe_account_id) return;
    if (ambassador.stripe_account_status === 'active') return;

    setReqsLoading(true);
    getMyStripeAccountStatus().then(result => {
      if (result.ok) {
        setStripeReqs(result.requirements);
      }
      setReqsLoading(false);
    });
  }, [ambassador]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  // ── Stats computation ──────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const totalReferrals = referrals.length;

  const conversionsThisMonth = referrals.filter(
    (r) => PAID_STATUSES.has(r.status) && r.converted_at != null && r.converted_at >= monthStart
  ).length;

  const lifetimeEarningsCents = referrals
    .filter((r) => r.status === 'paid_out' || r.paid_out_at != null)
    .reduce((sum, r) => sum + (r.reward_cents ?? 0), 0);

  const owedNowCents = referrals
    .filter((r) => ['approved', 'auto_approved', 'converted'].includes(r.status) && !r.paid_out_at)
    .reduce((sum, r) => sum + (r.reward_cents ?? 0), 0);

  // ── Loading spinner ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Nav />
        <div style={{ minHeight: '100dvh', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#C6A664', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  if (!ambassador) return null;

  const firstName = ambassador.full_name.split(' ')[0] || 'Ambassador';
  const referralLink = `https://704collective.com/referral?code=${ambassador.referral_code}`;

  return (
    <>
      <Nav />
      <MarketingPageRoot>
        <div style={{ backgroundColor: '#000000', minHeight: '100dvh', paddingTop: '80px', paddingBottom: '80px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 clamp(16px, 4vw, 24px)' }}>

            {/* ── SECTION 1: Header ────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '40px', paddingTop: '32px' }}>
              <div>
                <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: '#FFFFFF' }}>
                  Welcome back, {firstName}
                </h1>
                <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)' }}>
                  Your 704 Collective Ambassador Dashboard
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {isAlsoMember && (
                  <Link
                    href="/dashboard"
                    style={{ padding: '9px 18px', background: 'rgba(198,166,100,0.12)', border: '1px solid rgba(198,166,100,0.3)', borderRadius: '8px', color: '#C6A664', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}
                  >
                    Member Dashboard
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* ── SECTION 2: Referral Code + Link ──────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>

              {/* Left: code + link */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '28px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.625rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Your Referral Code</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <span style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 700, color: '#C6A664', fontFamily: 'ui-monospace, SFMono-Regular, monospace', letterSpacing: '0.05em' }}>
                    {ambassador.referral_code}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(ambassador.referral_code); toast.success('Code copied!'); }}
                    title="Copy code"
                    style={{ padding: '7px 12px', background: 'rgba(198,166,100,0.12)', border: '1px solid rgba(198,166,100,0.25)', borderRadius: '7px', color: '#C6A664', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Copy
                  </button>
                </div>

                <p style={{ margin: '0 0 6px', fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Your referral link</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ flex: 1, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', fontFamily: 'ui-monospace, SFMono-Regular, monospace', wordBreak: 'break-all' }}>
                    {referralLink}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(referralLink); toast.success('Link copied!'); }}
                    title="Copy link"
                    style={{ flexShrink: 0, padding: '7px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: 'rgba(255,255,255,0.6)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Copy
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)', lineHeight: 1.55 }}>
                  Share this with anyone you refer. They&apos;ll be auto-attributed to you.
                </p>
              </div>

              {/* Right: QR */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <Image
                  src="https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/704_referral_qr.png"
                  alt="704 Collective referral QR code"
                  width={200}
                  height={200}
                  style={{ borderRadius: '10px', maxWidth: '100%', height: 'auto' }}
                  unoptimized
                />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, textAlign: 'center', maxWidth: '220px' }}>
                  This QR code links to our public referral page. Direct anyone scanning to enter your unique code at signup.
                </p>
              </div>
            </div>

            {/* ── SECTION 3: Stats ─────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="Total Referrals" value={String(totalReferrals)} />
              <StatCard label="Conversions This Month" value={String(conversionsThisMonth)} />
              <StatCard label="Lifetime Earnings" value={usd(lifetimeEarningsCents)} />
              <StatCard label="Owed Right Now" value={usd(owedNowCents)} highlight={owedNowCents > 0} />
            </div>

            {/* ── SECTION 4: Stripe Connect ─────────────────────────────────── */}
            <div style={{ marginBottom: '32px' }}>
              <StripeStatusCard status={ambassador.stripe_account_status} accountId={ambassador.stripe_account_id} />
              {!reqsLoading && stripeReqs.length > 0 && ambassador.stripe_account_status !== 'active' && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                }}>
                  <p style={{ color: '#FCD34D', fontWeight: 600, fontSize: '0.875rem', margin: '0 0 8px' }}>
                    Stripe still needs the following from you:
                  </p>
                  <ul style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8125rem', paddingLeft: '20px', margin: 0 }}>
                    {stripeReqs.map((req, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{req}</li>
                    ))}
                  </ul>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', margin: '12px 0 0' }}>
                    Click &ldquo;Continue Stripe Setup&rdquo; below to add the missing info.
                  </p>
                </div>
              )}
            </div>

            {/* ── SECTION 5: Recent Referrals ───────────────────────────────── */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Recent Referrals
                {referrals.length > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.35)' }}>
                    (showing {referrals.length} most recent)
                  </span>
                )}
              </h2>

              {referrals.length === 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                  You haven&apos;t referred anyone yet.<br />
                  <span style={{ fontSize: '0.875rem' }}>Share your code or link above to start earning commissions!</span>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden' }}>
                  {/* Header row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px 130px 80px', gap: '12px', padding: '10px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['DATE', 'NAME', 'TIER', 'STATUS', 'REWARD'].map((h, i) => (
                      <span key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.09em', textTransform: 'uppercase', textAlign: i === 4 ? 'right' : 'left' }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  {/* Data rows */}
                  {referrals.slice(0, 20).map((r, i) => (
                    <div
                      key={r.id}
                      style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px 130px 80px', gap: '12px', padding: '14px 20px', borderBottom: i < Math.min(referrals.length, 20) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}
                    >
                      <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</span>
                      <div>
                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{r.referred_full_name || 'Unknown'}</p>
                        {r.referred_email && <p style={{ margin: '1px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>{r.referred_email}</p>}
                      </div>
                      <TierBadge tier={r.tier} />
                      <StatusBadge status={r.status} />
                      <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {r.reward_cents != null ? usd(r.reward_cents) : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── SECTION 6: Footer help ────────────────────────────────────── */}
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontStyle: 'italic' }}>
              Questions? Email us at{' '}
              <a href="mailto:hello@704collective.com" style={{ color: 'rgba(198,166,100,0.6)', textDecoration: 'none' }}>
                hello@704collective.com
              </a>{' '}
              - we&apos;re happy to help.
            </p>

          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </MarketingPageRoot>
    </>
  );
}
