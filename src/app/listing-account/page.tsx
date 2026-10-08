import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { networkServiceClient } from '@/lib/network/server';
import { HUB_COPY, isHub } from '@/lib/network/hubs';
import Nav from '@/components/Nav';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { SignOutButton } from './SignOutButton';

export const metadata: Metadata = { title: 'Your listing · 704 Collective', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Wave H4 holding page for listing-only accounts (member_type='listing').
 * Middleware pins these accounts here; they reach nothing member-only.
 * Server-rendered with the service role so no new RLS surface is opened:
 * the account only ever sees its own listings.
 */
export default async function ListingAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/listing-account');

  const admin = networkServiceClient();
  const [{ data: profile }, { data: listings }] = await Promise.all([
    admin.from('profiles').select('full_name, member_type, role').eq('id', user.id).maybeSingle(),
    admin.from('network_listings').select('company_name, hub, kind, status, billing_status, rate_cents, rate_locked_until, created_at')
      .eq('owner_profile_id', user.id).order('created_at', { ascending: false }),
  ]);
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role ?? '');
  if (profile?.member_type !== 'listing' && !isAdmin) redirect('/dashboard');

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const gold = '#C6A664';

  return (
    <>
      <Nav />
      <main id="main-content" style={{ paddingTop: '64px', backgroundColor: '#0d0d0d', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MarketingPageRoot>
          <div style={{ maxWidth: '520px', width: '100%', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }} data-testid="listing-account">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: gold, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>Listing account</p>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2, margin: 0 }}>Hey {firstName}, you&apos;re in.</h1>
              <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
                Your listing portal is coming. Until it ships, our team builds and publishes your listing by hand and emails you at every step.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(listings ?? []).length === 0 && (
                <p style={{ margin: 0, fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)' }}>No listings on this account yet.</p>
              )}
              {(listings ?? []).map((l, i) => {
                const hub = isHub(l.hub) ? HUB_COPY[l.hub].name : l.hub;
                return (
                  <div key={i} style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'rgba(198,166,100,0.08)', border: '1px solid rgba(198,166,100,0.3)', display: 'flex', flexDirection: 'column', gap: '8px' }} data-testid="listing-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#FFFFFF', fontSize: '1.0625rem' }}>{l.company_name}</strong>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: gold, border: `1px solid ${gold}55`, borderRadius: '999px', padding: '3px 10px' }}>{l.status}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)' }}>{hub} · {l.kind} · ${(l.rate_cents / 100).toFixed(0)}/mo{l.rate_locked_until ? `, rate locked until ${new Date(l.rate_locked_until).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}</p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)' }}>Billing: {l.billing_status}</p>
                  </div>
                );
              })}
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }} />

            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: gold, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>What happens next</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { step: '01', text: 'We draft your listing from your application and the links you gave us' },
                  { step: '02', text: 'You get a proof by email; reply with edits or a thumbs-up' },
                  { step: '03', text: 'We publish, and your listing starts collecting leads' },
                ].map(({ step, text }) => (
                  <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: gold, fontVariantNumeric: 'tabular-nums', minWidth: '24px', paddingTop: '2px' }}>{step}</span>
                    <span style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ width: '100%', height: '1px', backgroundColor: 'rgba(255,255,255,0.08)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              <a href="mailto:hello@704collective.com" style={{ display: 'block', width: '100%', padding: '12px 24px', backgroundColor: 'rgba(198,166,100,0.12)', border: '1px solid rgba(198,166,100,0.3)', borderRadius: '8px', color: gold, fontSize: '0.9375rem', fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                Questions about your listing? Email us
              </a>
              <SignOutButton />
            </div>
          </div>
        </MarketingPageRoot>
      </main>
    </>
  );
}
