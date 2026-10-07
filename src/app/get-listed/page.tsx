import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { HubFooter } from '@/components/network/HubSections';
import { ApplyForm } from '@/components/network/ApplyForm';
import { hubPagesLive } from '@/lib/network/flags';

export const revalidate = 60;
const SITE = 'https://704collective.com';

export async function generateMetadata(): Promise<Metadata> {
  if (!hubPagesLive()) return { robots: { index: false, follow: false } };
  const title = 'Get listed — own your category on The Network';
  const description = 'One exclusive seat per category on each 704 hub. Pass the 704 Review, hold the seat, from $150/month, rate locked 12 months.';
  return { title, description, alternates: { canonical: `${SITE}/get-listed` }, openGraph: { title, description, url: `${SITE}/get-listed`, siteName: '704 Collective', type: 'website' } };
}

const BENEFITS = [
  'The only business in your category on the hub — competitors cannot buy in while you hold the seat',
  'Every intro from the hub page and your profile comes to you, counted',
  'A vetted badge our members actually trust, backed by a public rubric',
  'Your profile, your film (exclusive seats), your links routed through 704',
  'Face time with members at 704 events across Charlotte',
];

export default function GetListedPage() {
  if (!hubPagesLive()) notFound();
  return (
    <NetworkShell>
      <HubNav current="get-listed" />
      <main id="main-content">
        <section className="nw-hero" style={{ background: 'var(--nw-band)' }}>
          <div className="nw-wrap nw-hero-in">
            <span className="nw-pill ink">Get listed</span>
            <h1 className="nw-serif nw-h1">Own your category. One seat. Held by you.</h1>
            <p className="nw-promise">The Network is four hubs of vetted Charlotte businesses. Each category has one exclusive seat. If yours is open and you pass the 704 Review, it can be yours.</p>
          </div>
        </section>

        <section className="nw-section">
          <div className="nw-wrap nw-two">
            <div>
              <span className="nw-eyebrow">What you get</span>
              <h2 className="nw-serif nw-h2">Not a directory. A room.</h2>
              <ul className="nw-checks">{BENEFITS.map((b) => <li key={b}>{b}</li>)}</ul>
              <div className="nw-note" style={{ marginTop: 24 }}>
                <strong>Seat conflicts.</strong> If your category&apos;s seat is already held on the hub you choose, you can apply for a vetted spotlight (non-exclusive) or join the waitlist for the seat. We&apos;ll tell you which when we review.
              </div>
            </div>
            <div className="nw-price-card" data-block="price">
              <span className="nw-eyebrow">Exclusive seat</span>
              <div className="nw-serif nw-price" style={{ margin: '8px 0 4px' }}>$150<span style={{ fontSize: 22 }}>/mo</span></div>
              <p className="nw-muted">Rate locked for 12 months. Pricing increases as hubs fill — the earlier you hold a seat, the lower your rate stays.</p>
              <ul className="nw-checks" style={{ marginTop: 16 }}>
                <li>Pass the 704 Review first (five pillars, 40 of 50)</li>
                <li>Re-verified quarterly</li>
                <li>Cancel any time; the seat reopens</li>
              </ul>
              <a href="#apply" className="nw-btn primary" style={{ marginTop: 18 }}>Apply for a seat</a>
            </div>
          </div>
        </section>

        <section className="nw-section" style={{ paddingTop: 0 }}>
          <div className="nw-wrap">
            <span className="nw-eyebrow">The application</span>
            <h2 className="nw-serif nw-h2">Tell us about the business.</h2>
            <p className="nw-lede">Reviewed by hand. Expect a reply within a week.</p>
            <div style={{ marginTop: 24, maxWidth: 760 }}><ApplyForm /></div>
          </div>
        </section>

        <section className="nw-section" style={{ paddingTop: 0 }}>
          <div className="nw-wrap">
            <div className="nw-steps">
              <div className="nw-step"><span className="nw-step-num">01</span><h3 className="nw-serif nw-step-title">Apply</h3><p className="nw-muted">Five minutes. Honest answers beat polished ones.</p></div>
              <div className="nw-step"><span className="nw-step-num">02</span><h3 className="nw-serif nw-step-title">Get approved</h3><p className="nw-muted">We run the 704 Review and tell you your score. 40 of 50 passes.</p></div>
              <div className="nw-step"><span className="nw-step-num">03</span><h3 className="nw-serif nw-step-title">Go live</h3><p className="nw-muted">Your seat, your profile, your intros — usually inside two weeks.</p></div>
            </div>
          </div>
        </section>

        <section className="nw-dark" data-block="closing">
          <div className="nw-wrap" style={{ padding: '64px 24px' }}>
            <h2 className="nw-serif" style={{ fontSize: 'clamp(30px, 4.5vw, 54px)', lineHeight: 1.04, maxWidth: 820 }}>Four hubs. One seat per category. A bar we actually hold.</h2>
            <div className="nw-card-actions" style={{ marginTop: 22 }}>
              <a href="#apply" className="nw-btn light">Apply for a seat</a>
              <Link href="/how-we-vet" className="nw-btn outline-light">How we vet</Link>
            </div>
          </div>
        </section>
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
