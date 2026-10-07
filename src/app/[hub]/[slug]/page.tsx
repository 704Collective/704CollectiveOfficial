import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import JsonLd from '@/components/JsonLd';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { HubFooter } from '@/components/network/HubSections';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isVisibleHub } from '@/lib/network/hubs';
import { getListingBySlug } from '@/lib/network/queries';

export const revalidate = 60;

const SITE = 'https://704collective.com';
type Props = { params: Promise<{ hub: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub, slug } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) return { robots: { index: false, follow: false } };
  const l = await getListingBySlug(hub, slug);
  if (!l) return { robots: { index: false, follow: false } };
  const title = `${l.company_name} — ${HUB_COPY[hub].name} · vetted by 704`;
  const description = l.hook ?? l.description?.slice(0, 160) ?? `${l.company_name} passed the 704 Review.`;
  return {
    title, description,
    alternates: { canonical: `${SITE}/${hub}/${slug}` },
    openGraph: { title, description, url: `${SITE}/${hub}/${slug}`, siteName: '704 Collective', type: 'website', ...(l.photo_urls?.[0] ? { images: [{ url: l.photo_urls[0] }] } : {}) },
  };
}

const RECEIPT = ['Identity and licensing verified', 'Reviews and reputation checked', 'Member references contacted', 'Pricing and terms transparent', 'Responds to intros within 48 hours'];

export default async function ListingProfilePage({ params }: Props) {
  const { hub, slug } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) notFound();
  const l = await getListingBySlug(hub, slug);
  if (!l) notFound(); // status='live' only, enforced by the query + RLS

  const copy = HUB_COPY[hub];
  const exclusive = l.kind === 'seat';
  const verified = l.verified_at ? format(new Date(l.verified_at), 'MMMM d, yyyy') : null;
  const photo = l.photo_urls?.[0] ?? null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: l.company_name,
    url: `${SITE}/${hub}/${slug}`,
    ...(l.description ? { description: l.description } : {}),
    ...(l.logo_url ? { logo: l.logo_url } : {}),
    ...(photo ? { image: photo } : {}),
    ...(l.phone ? { telephone: l.phone } : {}),
    ...(l.neighborhood ? { areaServed: l.neighborhood, address: { '@type': 'PostalAddress', addressLocality: 'Charlotte', addressRegion: 'NC' } } : {}),
    ...(l.website_url ? { sameAs: [l.website_url, ...(l.instagram_url ? [l.instagram_url] : [])] } : {}),
  };

  return (
    <NetworkShell hub={hub}>
      <JsonLd schema={schema} />
      <HubNav current={hub} />
      <main id="main-content">
        <section className="nw-wrap nw-profile-head" data-variant={exclusive ? 'exclusive' : 'vetted'}>
          <div>
            <Link href={`/${hub}`} className="nw-eyebrow">← {copy.name}</Link>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <span className={`nw-badge ${exclusive ? 'solid' : 'outline'}`}>{exclusive ? 'Exclusive' : 'Vetted'}</span>
              {l.category ? <span className="nw-card-cat">{l.category.label}</span> : null}
            </div>
            <h1 className="nw-serif nw-h1" style={{ fontSize: 'clamp(36px, 5.4vw, 64px)' }}>{l.company_name}</h1>
            {l.hook ? <p className="nw-promise">{l.hook}</p> : null}
            {l.description ? <p style={{ marginTop: 18, maxWidth: 680 }}>{l.description}</p> : null}
            <div className="nw-card-actions" style={{ marginTop: 22 }}>
              <Link href={`/intro/${l.slug}`} className="nw-btn accent">Request an intro</Link>
              {l.website_url ? <a href={`/out/${l.slug}/website`} className="nw-btn ghost" rel="nofollow">Website</a> : null}
              {l.instagram_url ? <a href={`/out/${l.slug}/instagram`} className="nw-btn ghost" rel="nofollow">Instagram</a> : null}
              {l.phone ? <a href={`/out/${l.slug}/phone`} className="nw-btn ghost" rel="nofollow">Call</a> : null}
            </div>
            <p className="nw-form-note" style={{ marginTop: 10 }}>Links open through 704 so your intro is counted for them.</p>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            {exclusive ? (
              <>
                <div className="nw-film" data-block="film">{photo ? <img src={photo} alt="" /> : null}<span className="nw-play" aria-hidden="true">▶</span></div>
                <div className="nw-side-card dark" data-block="holds-seat">
                  <span className="nw-eyebrow">Exclusive seat</span>
                  <h2 className="nw-serif" style={{ fontSize: 26, margin: '6px 0 8px' }}>Holds the exclusive seat</h2>
                  <p className="nw-muted">The only {l.category?.label.toLowerCase() ?? 'business in its category'} on {copy.name}. No competitor can buy into this category while the seat is held.</p>
                </div>
              </>
            ) : (
              <div className="nw-side-card dashed" data-block="film-nudge">
                <span className="nw-eyebrow">Want the film treatment?</span>
                <h2 className="nw-serif" style={{ fontSize: 24, margin: '6px 0 8px' }}>Exclusive seats get the film, the seat number and the first intro.</h2>
                <p className="nw-muted">Members who hold a seat get a short film on their profile and own their category on the hub.</p>
                <Link href="/get-listed" className="nw-btn ghost" style={{ marginTop: 12 }}>Ask about a seat</Link>
              </div>
            )}
          </div>
        </section>

        <section className="nw-wrap" style={{ paddingBottom: 48, display: 'grid', gap: 28 }}>
          <div className="nw-receipt" data-block="receipt">
            <span className="nw-eyebrow">Vetting receipt</span>
            <h2 className="nw-serif" style={{ fontSize: 26, margin: '6px 0 4px' }}>Passed the 704 Review{l.review_score ? ` · ${l.review_score}/50` : ''}</h2>
            <ul>{RECEIPT.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="nw-muted" style={{ fontSize: 14 }}>
              {verified ? `Verified ${verified}` : 'Verification pending'} · re-reviewed quarterly{l.next_review_at ? ` (next ${format(new Date(l.next_review_at), 'MMMM yyyy')})` : ''}. Businesses that slip below the bar are removed.
            </p>
          </div>
          <div data-block="good-to-know">
            <span className="nw-eyebrow">Good to know</span>
            <dl className="nw-kv" style={{ marginTop: 12 }}>
              <div><dt>Hub</dt><dd>{copy.name}</dd></div>
              {l.category ? <div><dt>Category</dt><dd>{l.category.label}</dd></div> : null}
              {l.neighborhood ? <div><dt>Neighborhood</dt><dd>{l.neighborhood}</dd></div> : null}
              <div><dt>Placement</dt><dd>{exclusive ? 'Exclusive seat' : 'Vetted spotlight'}</dd></div>
              {verified ? <div><dt>Verified</dt><dd>{verified}</dd></div> : null}
              <div><dt>Intros</dt><dd>Through 704</dd></div>
            </dl>
          </div>
        </section>

        <section className="nw-intro-band" data-block="intro-band">
          <div className="nw-wrap">
            <div>
              <span className="nw-eyebrow">Request an intro</span>
              <h2 className="nw-serif" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', margin: '6px 0' }}>Tell {l.company_name} what you need.</h2>
              <p className="nw-muted">We pass it along with your details. They reply to you directly.</p>
            </div>
            <Link href={`/intro/${l.slug}`} className="nw-btn light">Request an intro</Link>
          </div>
        </section>
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
