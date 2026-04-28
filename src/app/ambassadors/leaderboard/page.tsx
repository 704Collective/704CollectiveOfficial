import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ambassador Leaderboard | 704 Collective',
  description:
    'The 704 Collective community is built by people who believe in it. See the top ambassadors helping us grow.',
  openGraph: {
    title: 'Ambassador Leaderboard | 704 Collective',
    description:
      'The 704 Collective community is built by people who believe in it. See the top ambassadors helping us grow.',
    url: 'https://704collective.com/ambassadors/leaderboard',
    siteName: '704 Collective',
    images: [{ url: 'https://704collective.com/og-image.png', width: 1200, height: 630, alt: '704 Collective' }],
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/ambassadors/leaderboard' },
};

type LeaderboardRow = {
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

// Trophy SVG (rank 1)
function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C6A664" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="18" width="12" height="4" />
    </svg>
  );
}

// Medal SVG (ranks 2-3)
function MedalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="14" r="8" />
      <path d="M8.56 2.9A7 7 0 0 1 12 2a7 7 0 0 1 3.44.9L17 6H7L8.56 2.9z" />
    </svg>
  );
}

export default async function AmbassadorLeaderboardPage() {
  const supabase = await createClient();

  const [leaderboardRes, countRes] = await Promise.all([
    supabase.rpc('get_ambassador_leaderboard'),
    supabase.from('ambassadors').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const leaderboard = (leaderboardRes.data ?? []) as LeaderboardRow[];
  const totalAmbassadors = countRes.count ?? leaderboard.length;
  const totalReferred = leaderboard.reduce((sum, r) => sum + Number(r.total_referrals), 0);
  const totalPaidCents = leaderboard.reduce((sum, r) => sum + Number(r.total_earned_cents), 0);
  const topReferrals = Number(leaderboard[0]?.total_referrals ?? 0);

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

        {/* ── Hero ── */}
        <section style={{ padding: 'clamp(48px, 8vw, 96px) clamp(16px, 5vw, 24px) clamp(24px, 4vw, 48px)' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
            {/* badge */}
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

            <h1 style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.1, margin: '0 0 20px' }}>
              Ambassador Leaderboard
            </h1>
            <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.1875rem)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, maxWidth: '600px', margin: '0 auto' }}>
              The 704 Collective community is built by people who believe in it. Here are the ambassadors helping us grow.
            </p>
          </div>
        </section>

        {/* ── Stats row ── */}
        <section style={{ padding: '0 clamp(16px, 5vw, 24px) clamp(32px, 4vw, 48px)' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            {statCards.map((s) => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '20px',
              }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {s.label}
                </p>
                <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Leaderboard table ── */}
        <section style={{ padding: 'clamp(16px, 3vw, 32px) clamp(16px, 5vw, 24px) clamp(64px, 8vw, 96px)' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden' }}>

              {/* column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr 100px 100px',
                gap: '16px',
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.035)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                {(['RANK', 'NAME', 'REFERRALS', 'EARNED'] as const).map((h, hi) => (
                  <span key={h} style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', textAlign: hi >= 2 ? 'right' : 'left' }}>
                    {h}
                  </span>
                ))}
              </div>

              {leaderboard.length === 0 ? (
                <div style={{ padding: '72px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem' }}>
                  No results yet — be the first!
                </div>
              ) : (
                leaderboard.map((row, i) => {
                  const rank = i + 1;
                  const isGold = rank === 1;
                  const isSilver = rank === 2 || rank === 3;
                  const nameColor = isGold ? '#C6A664' : isSilver ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.65)';
                  const codeColor = isGold ? 'rgba(198,166,100,0.8)' : 'rgba(255,255,255,0.28)';

                  return (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '52px 1fr 100px 100px',
                        gap: '16px',
                        padding: '16px 24px',
                        borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: isGold ? 'rgba(198,166,100,0.04)' : 'transparent',
                        alignItems: 'center',
                        transition: 'background 200ms',
                      }}
                    >
                      {/* rank */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isGold ? <TrophyIcon /> : isSilver ? <MedalIcon /> : (
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>#{rank}</span>
                        )}
                      </div>

                      {/* name + code */}
                      <div>
                        <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: nameColor }}>{row.full_name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.75rem', fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: codeColor }}>{row.referral_code}</p>
                      </div>

                      {/* referrals */}
                      <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: nameColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(row.total_referrals)}
                      </p>

                      {/* earned */}
                      <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {dollars(Number(row.total_earned_cents))}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* ── CTA Footer ── */}
        <section style={{
          padding: 'clamp(48px, 7vw, 80px) clamp(16px, 5vw, 24px)',
          background: 'rgba(198,166,100,0.06)',
          borderTop: '1px solid rgba(198,166,100,0.15)',
        }}>
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 700, color: '#FFFFFF', margin: '0 0 16px' }}>
              Want to become an ambassador?
            </h2>
            <p style={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, margin: '0 0 36px' }}>
              704 Collective ambassadors earn cash rewards for every member they bring in. If you love the community and want to help it grow, we would love to have you.
            </p>
            <a
              href="mailto:hello@704collective.com?subject=Ambassador%20Application"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 32px',
                background: '#C6A664',
                color: '#1A1A1A',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Apply to be an ambassador →
            </a>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
