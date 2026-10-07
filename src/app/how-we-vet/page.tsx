import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { HubFooter } from '@/components/network/HubSections';
import { hubPagesLive } from '@/lib/network/flags';

export const revalidate = 60;
const SITE = 'https://704collective.com';

export async function generateMetadata(): Promise<Metadata> {
  if (!hubPagesLive()) return { robots: { index: false, follow: false } };
  const title = 'How we vet — the 704 Review';
  const description = 'Five pillars, 50 points, 40 to pass, re-verified quarterly. The full rubric behind every business on The Network.';
  return { title, description, alternates: { canonical: `${SITE}/how-we-vet` }, openGraph: { title, description, url: `${SITE}/how-we-vet`, siteName: '704 Collective', type: 'website' } };
}

const PILLARS = [
  { title: 'Legitimacy', body: 'Licensed, insured where it matters, a real place of business, a real person who answers.' },
  { title: 'Reputation', body: 'Public reviews read in full, patterns weighed over averages, complaints traced to resolution.' },
  { title: 'Member signal', body: 'At least two 704 members who have actually paid them, contacted directly.' },
  { title: 'Transparency', body: 'Pricing you can find, terms you can read, no bait on the first call.' },
  { title: 'Responsiveness', body: 'Replies to a 704 intro inside 48 hours. We test it before and after listing.' },
];

export default function HowWeVetPage() {
  if (!hubPagesLive()) notFound();
  return (
    <NetworkShell>
      <HubNav current="how-we-vet" />
      <main id="main-content">
        <section className="nw-hero" style={{ background: 'var(--nw-band)' }}>
          <div className="nw-wrap nw-hero-in">
            <span className="nw-pill ink">The 704 Review</span>
            <h1 className="nw-serif nw-h1">Vetted means we did the homework. Here it is.</h1>
            <p className="nw-promise">Every business on The Network scored at least 40 of 50 on the rubric below, and is re-scored every quarter. Nothing on this page is for sale.</p>
          </div>
        </section>

        <div className="nw-statribbon" data-block="stat-ribbon">
          <div className="nw-wrap">
            <span>The bar is the product.</span><span>Five pillars</span><span>·</span><span>50 points</span><span>·</span><span>40 to pass</span><span>·</span><span>re-verified quarterly</span><span>·</span><span>removal is real</span>
          </div>
        </div>

        <section className="nw-section">
          <div className="nw-wrap">
            <span className="nw-eyebrow">The rubric</span>
            <h2 className="nw-serif nw-h2">Five pillars. Ten points each.</h2>
            <div className="nw-pillars" style={{ marginTop: 28 }}>
              {PILLARS.map((p, i) => (
                <div key={p.title} className="nw-pillar"><span className="nw-pillar-pts">0{i + 1} · 10 points</span><h3 className="nw-serif nw-pillar-title">{p.title}</h3><p className="nw-muted">{p.body}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="nw-dark" data-block="rules">
          <div className="nw-wrap" style={{ padding: '64px 24px' }}>
            <span className="nw-eyebrow">The rules</span>
            <div className="nw-rules" style={{ marginTop: 20 }}>
              <div><div className="nw-serif nw-rule-num">40/50</div><p className="nw-muted">Passes. 39 does not. We tell every applicant their score.</p></div>
              <div><div className="nw-serif nw-rule-num">Quarterly</div><p className="nw-muted">Every listed business is re-scored every three months. The verified date is on their profile.</p></div>
              <div><div className="nw-serif nw-rule-num">Removal happens</div><p className="nw-muted">Drop below the bar, or let a member down and leave it unresolved, and the listing comes down.</p></div>
              <div><div className="nw-serif nw-rule-num">Never for sale</div><p className="nw-muted">The placement is paid. The words “vetted” and “exclusive” are not. No score was ever bought.</p></div>
            </div>
          </div>
        </section>

        <section className="nw-section" data-block="closing">
          <div className="nw-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span className="nw-eyebrow">Think you clear the bar?</span>
              <h2 className="nw-serif nw-h2" style={{ marginBottom: 0 }}>Apply for a seat.</h2>
            </div>
            <Link href="/get-listed" className="nw-btn primary">Get listed</Link>
          </div>
        </section>
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
