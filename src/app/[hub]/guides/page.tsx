import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { HubFooter } from '@/components/network/HubSections';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isVisibleHub } from '@/lib/network/hubs';
import { getHubGuides } from '@/lib/network/guides';
import { readingTimeMinutesFromContent } from '@/lib/blog/readingTime';

export const revalidate = 60;
const SITE = 'https://704collective.com';
type Props = { params: Promise<{ hub: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) return { robots: { index: false, follow: false } };
  const title = `${HUB_COPY[hub].name} guides — from the hub`;
  const description = `Guides, picks and plain answers from ${HUB_COPY[hub].name}, written around the businesses that passed the 704 Review.`;
  return { title, description, alternates: { canonical: `${SITE}/${hub}/guides` }, openGraph: { title, description, url: `${SITE}/${hub}/guides`, siteName: '704 Collective', type: 'website' } };
}

/** Wave H7 — hub blog index. Published posts whose hub matches; clean empty state. */
export default async function HubGuidesPage({ params }: Props) {
  const { hub } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) notFound();
  const copy = HUB_COPY[hub];
  const posts = await getHubGuides(hub);
  return (
    <NetworkShell hub={hub}>
      <HubNav current={hub} />
      <main id="main-content">
        <section className="nw-hero">
          <div className="nw-wrap nw-hero-in">
            <Link href={`/${hub}`} className="nw-eyebrow">← {copy.name}</Link>
            <span className="nw-pill" style={{ marginTop: 14, display: 'inline-flex' }}>Guides</span>
            <h1 className="nw-serif nw-h1">From {copy.name}.</h1>
            <p className="nw-promise">Guides, picks and plain answers, written around the businesses that passed the 704 Review.</p>
          </div>
        </section>
        <section className="nw-section" data-section="guides">
          <div className="nw-wrap">
            {posts.length === 0 ? (
              <div className="nw-note" data-testid="guides-empty" style={{ maxWidth: 560 }}>
                <strong>Nothing here yet.</strong> The first {copy.name} guide is on its way. In the meantime, the room is open: <Link href={`/${hub}`} style={{ textDecoration: 'underline' }}>see who holds the seats</Link>.
              </div>
            ) : (
              <div className="nw-posts" data-testid="guides-grid">
                {posts.map((p) => {
                  const mins = p.reading_time_minutes && p.reading_time_minutes > 0 ? p.reading_time_minutes : Math.max(1, readingTimeMinutesFromContent(p.content));
                  return (
                    <Link key={p.id} href={`/${hub}/guides/${p.slug}`} className="nw-post" data-testid="guide-card">
                      {p.cover_image_url ? <img src={p.cover_image_url} alt={p.cover_image_alt ?? ''} /> : null}
                      <div className="nw-post-body">
                        <span className="nw-eyebrow" style={{ color: 'var(--nw-accent)' }}>{copy.name}</span>
                        <h3 className="nw-serif nw-post-title" style={{ marginTop: 6 }}>{p.title}</h3>
                        {p.excerpt ? <p className="nw-muted" style={{ fontSize: 14 }}>{p.excerpt}</p> : null}
                        <p className="nw-muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                          {p.published_at ? <time dateTime={p.published_at}>{format(new Date(p.published_at), 'MMM d, yyyy')}</time> : null}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} aria-hidden /> {mins} min</span>
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
