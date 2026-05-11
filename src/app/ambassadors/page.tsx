import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ambassador Leaderboard | 704 Collective',
  description:
    'See the top 704 Collective ambassadors for this month and all-time. Join the program and earn cash for every member you refer.',
  openGraph: {
    title: 'Ambassador Leaderboard | 704 Collective',
    description:
      'See the top 704 Collective ambassadors for this month and all-time. Join the program and earn cash for every member you refer.',
    url: 'https://704collective.com/ambassadors',
    siteName: '704 Collective',
    images: [{ url: 'https://704collective.com/og-image.png', width: 1200, height: 630, alt: '704 Collective' }],
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/ambassadors' },
};

type MonthlyRow = {
  id: string;
  full_name: string;
  referral_code: string;
  conversions_this_month: number;
};

type AllTimeRow = {
  id: string;
  full_name: string;
  referral_code: string;
  total_referrals: number;
  total_earned_cents: number;
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getMonthHeading(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + ' Top Performers';
}

function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C6A664" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="18" width="12" height="4" />
    </svg>
  );
}

function MedalIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="14" r="8" />
      <path d="M8.56 2.9A7 7 0 0 1 12 2a7 7 0 0 1 3.44.9L17 6H7L8.56 2.9z" />
    </svg>
  );
}

export default async function AmbassadorsPage() {
  const supabase = await createClient();

  // Role gate: only ambassadors and admins can see the leaderboard.
  const { data: { user } } = await supabase.auth.getUser();
  let canViewLeaderboard = false;
  if (user) {
    const [profileRes, ambassadorRes] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('ambassadors').select('id').eq('profile_id', user.id).maybeSingle(),
    ]);
    const role = profileRes.data?.role ?? null;
    const isAdmin = role === 'admin' || role === 'super_admin';
    const isAmbassador = !!ambassadorRes.data;
    canViewLeaderboard = isAdmin || isAmbassador;
  }

  if (!canViewLeaderboard) {
    return (
      <>
        <Nav />
        <main id="main-content" style={{ backgroundColor: '#0a0a0a', minHeight: '100vh', paddingTop: '80px' }}>
          <section style={{ padding: 'clamp(64px, 10vw, 120px) clamp(16px, 5vw, 24px)' }}>
            <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px',
                padding: '6px 14px',
                background: 'rgba(198,166,100,0.12)',
                border: '1px solid rgba(198,166,100,0.3)',
                borderRadius: '100px',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#C6A664" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span style={{ fontSize: '0.7rem', color: '#C6A664', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ambassador Program</span>
              </div>

              <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.1, margin: '0 0 20px' }}>
                704 Collective
                <br />
                <span style={{ color: '#C6A664' }}>Ambassador Program</span>
              </h1>

              <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.125rem)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Earn <strong style={{ color: '#C6A664' }}>$20</strong> for every Social member you refer,{' '}
                <strong style={{ color: '#C6A664' }}>$125</strong> for every Business member.
              </p>

              <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: '0 0 40px' }}>
                Interested in becoming an ambassador? Reach out to{' '}
                <a href="mailto:hello@704collective.com" style={{ color: '#C6A664', textDecoration: 'none' }}>
                  hello@704collective.com
                </a>{' '}
                to learn more.
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '16px',
                marginBottom: '40px',
              }}>
                {[
                  { label: 'Per Social Referral', value: '$20' },
                  { label: 'Per Business Referral', value: '$125' },
                  { label: 'Payouts', value: 'Monthly' },
                ].map((card) => (
                  <div key={card.label} style={{
                    padding: '20px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(198,166,100,0.15)',
                    borderRadius: '12px',
                  }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#C6A664', marginBottom: '6px' }}>{card.value}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</div>
                  </div>
                ))}
              </div>

              <a
                href="mailto:hello@704collective.com?subject=Ambassador%20Program%20Inquiry"
                style={{
                  display: 'inline-block',
                  padding: '14px 32px',
                  background: '#C6A664',
                  color: '#0a0a0a',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  textDecoration: 'none',
                  letterSpacing: '0.02em',
                }}
              >
                Get in Touch
              </a>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const [monthlyRes, allTimeRes, activeCountRes] = await Promise.all([
    supabase.rpc('get_monthly_ambassador_leaderboard'),
    supabase.rpc('get_ambassador_leaderboard'),
    supabase.from('ambassadors').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const monthly = ((monthlyRes.data ?? []) as MonthlyRow[]).slice(0, 5);
  const allTime = (allTimeRes.data ?? []) as AllTimeRow[];
  const totalAmbassadors = activeCountRes.count ?? allTime.length;
  const totalReferred = allTime.reduce((sum, r) => sum + Number(r.total_referrals), 0);
  const totalPaidCents = allTime.reduce((sum, r) => sum + Number(r.total_earned_cents), 0);
  const topReferrals = Number(allTime[0]?.total_referrals ?? 0);

  const statCards = [
    { label: 'Active Ambassadors', value: String(totalAmbassadors) },
    { label: 'Members Referred', value: String(totalReferred) },
    { label: 'All-Time Payouts', value: dollars(totalPaidCents) },
    { label: 'Top Referrals', value: String(topReferrals) },
  ];

  return (
    <>
      <Nav />
      <main id="main-content" style={{ backgroundColor: '#0a0a0a', minHeight: '100vh', paddingTop: '80px' }}>

        {/* Hero */}
        <section style={{ padding: 'clamp(48px, 8vw, 96px) clamp(16px, 5vw, 24px) clamp(24px, 4vw, 48px)' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px',
              padding: '6px 14px',
              background: 'rgba(198,166,100,0.12)',
              border: '1px solid rgba(198,166,100,0.3)',
              borderRadius: '100px',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#C6A664" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span style={{ fontSize: '0.7rem', color: '#C6A664', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ambassador Program</span>
            </div>

            <h1 style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.1, margin: '0 0 16px' }}>
              704 Collective Ambassadors
            </h1>
            <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.1875rem)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, maxWidth: '560px', margin: '0 auto' }}>
              {getMonthHeading()}
            </p>
          </div>
        </section>

        {/* Monthly leaderboard */}
        <section style={{ padding: '0 clamp(16px, 5vw, 24px) clamp(32px, 4vw, 56px)' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto' }}>

            <h2 style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#C6A664', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>
              This Month
            </h2>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden' }}>

              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr 140px',
                gap: '16px',
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.035)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                {(['RANK', 'NAME', 'CONVERSIONS'] as const).map((h, hi) => (
                  <span key={h} style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', textAlign: hi >= 2 ? 'right' : 'left' }}>
                    {h}
                  </span>
                ))}
              </div>

              {monthly.length === 0 ? (
                <div style={{ padding: '72px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem' }}>
                  Nobody on the leaderboard yet - be the first!
                </div>
              ) : (
                monthly.map((row, i) => {
                  const rank = i + 1;
                  const isGold = rank === 1;
                  const isSilver = rank === 2;
                  const isBronze = rank === 3;
                  const nameColor = isGold ? '#C6A664' : (isSilver || isBronze) ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.65)';
                  const codeColor = isGold ? 'rgba(198,166,100,0.8)' : 'rgba(255,255,255,0.28)';

                  return (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '52px 1fr 140px',
                        gap: '16px',
                        padding: '18px 24px',
                        borderBottom: i < monthly.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: isGold ? 'rgba(198,166,100,0.04)' : 'transparent',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isGold ? <TrophyIcon /> : isSilver ? <MedalIcon color="rgba(192,192,192,0.8)" /> : isBronze ? <MedalIcon color="rgba(205,127,50,0.8)" /> : (
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>#{rank}</span>
                        )}
                      </div>

                      <div>
                        <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: nameColor }}>{row.full_name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: codeColor }}>{row.referral_code}</p>
                      </div>

                      <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: nameColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(row.conversions_this_month)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* All-time stats */}
        <section style={{ padding: '0 clamp(16px, 5vw, 24px) clamp(40px, 5vw, 64px)' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>
              All-Time
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
              {statCards.map((s) => (
                <div key={s.label} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px',
                  padding: '16px 18px',
                }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {s.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 'clamp(1.25rem, 2.5vw, 1.625rem)', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA cards */}
        <section style={{
          padding: 'clamp(40px, 6vw, 72px) clamp(16px, 5vw, 24px) clamp(64px, 8vw, 96px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

            {/* Card A: Login */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: 'clamp(24px, 4vw, 36px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                  Ambassador Portal
                </p>
                <h3 style={{ margin: 0, fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
                  Already an Ambassador?
                </h3>
                <p style={{ margin: '10px 0 0', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Log in to see your referral stats, payout history, and your unique referral code.
                </p>
              </div>
              <a
                href="/ambassadors/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '13px 28px',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  alignSelf: 'flex-start',
                }}
              >
                Login →
              </a>
            </div>

            {/* Card B: Apply */}
            <div style={{
              background: 'rgba(198,166,100,0.07)',
              border: '1px solid rgba(198,166,100,0.25)',
              borderRadius: '16px',
              padding: 'clamp(24px, 4vw, 36px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C6A664' }}>
                  Join the Program
                </p>
                <h3 style={{ margin: 0, fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
                  Become an Ambassador
                </h3>
                <p style={{ margin: '10px 0 0', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  Earn cash rewards for every member you bring in. If you love the community and want to help it grow, we&apos;d love to have you.
                </p>
              </div>
              <a
                href="mailto:hello@704collective.com?subject=Ambassador%20Application"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '13px 28px',
                  background: '#C6A664',
                  color: '#1A1A1A',
                  borderRadius: '8px',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  alignSelf: 'flex-start',
                }}
              >
                Apply Now
              </a>
            </div>

          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
