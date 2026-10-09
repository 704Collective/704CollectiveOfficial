import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import JsonLd from '@/components/JsonLd';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { HubFooter } from '@/components/network/HubSections';
import { MentionedListings } from '@/components/network/MentionedListings';
import { BlogSocialEmbeds } from '@/components/blog/BlogSocialEmbeds';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isVisibleHub } from '@/lib/network/hubs';
import { getHubGuide, getMentionedListings, postCanonical } from '@/lib/network/guides';
import { sanitizeBlogHtml } from '@/lib/blog/sanitizePostHtml';
import { injectHeadingAnchorsAndBuildToc } from '@/lib/blog/blogToc';
import { readingTimeMinutesFromContent } from '@/lib/blog/readingTime';
import { fetchInstagramOembedHtml, fetchTikTokOembedHtml } from '@/lib/blog/fetchSocialOembed';

export const revalidate = 60;
const SITE = 'https://704collective.com';
type Props = { params: Promise<{ hub: string; slug: string }> };

const absImage = (u: string | null | undefined) => (!u ? `${SITE}/og-image.png` : u.startsWith('http') ? u : u.startsWith('/') ? `${SITE}${u}` : u);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub, slug } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) return { robots: { index: false, follow: false } };
  const post = await getHubGuide(hub, slug);
  if (!post) return { robots: { index: false, follow: false } };
  const title = `${post.meta_title?.trim() || post.title} — ${HUB_COPY[hub].name} guide`;
  const description = post.meta_description?.trim() || post.excerpt?.trim() || `A ${HUB_COPY[hub].name} guide from 704.`;
  const canonical = postCanonical(post);
  return {
    title, description, robots: { index: true, follow: true }, alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: '704 Collective', type: 'article', publishedTime: post.published_at ?? undefined, images: [{ url: absImage(post.cover_image_url), width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [absImage(post.cover_image_url)] },
  };
}

/** Wave H7 — a hub-tagged post under hub chrome. Same body pipeline as /blog/[slug]; Mentioned cards from live listings. */
export default async function HubGuidePage({ params }: Props) {
  const { hub, slug } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) notFound();
  const post = await getHubGuide(hub, slug);
  if (!post) notFound();
  const copy = HUB_COPY[hub];

  const { html: bodyHtml, toc } = injectHeadingAnchorsAndBuildToc(sanitizeBlogHtml(post.content));
  const showToc = post.show_table_of_contents === true && toc.length > 0;
  const readMins = post.reading_time_minutes && post.reading_time_minutes > 0 ? post.reading_time_minutes : Math.max(1, readingTimeMinutesFromContent(post.content));
  const canonical = postCanonical(post);
  const [instagramHtml, tiktokHtml, mentioned] = await Promise.all([
    post.instagram_embed_url?.trim() ? fetchInstagramOembedHtml(post.instagram_embed_url) : Promise.resolve(null),
    post.tiktok_embed_url?.trim() ? fetchTikTokOembedHtml(post.tiktok_embed_url) : Promise.resolve(null),
    getMentionedListings(post.network_listing_ids),
  ]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt?.trim() || post.meta_description?.trim() || undefined,
    image: [absImage(post.cover_image_url)],
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at ?? undefined,
    author: post.author ? { '@type': 'Person', name: post.author } : { '@type': 'Organization', name: '704 Collective' },
    publisher: { '@type': 'Organization', name: '704 Collective', url: SITE },
    articleSection: copy.name,
    ...(mentioned.listings.length ? { mentions: mentioned.listings.map((l) => ({ '@type': 'LocalBusiness', name: l.company_name, url: `${SITE}/${l.hub}/${l.slug}` })) } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  return (
    <NetworkShell hub={hub}>
      <JsonLd schema={schema} />
      <HubNav current={hub} />
      <main id="main-content">
        <section className="nw-hero">
          <div className="nw-wrap nw-hero-in" style={{ maxWidth: 820 }}>
            <Link href={`/${hub}/guides`} className="nw-eyebrow">← {copy.name} guides</Link>
            <span className="nw-pill" style={{ marginTop: 14, display: 'inline-flex' }} data-testid="guide-kicker">{copy.kicker}</span>
            <h1 className="nw-serif nw-h1" style={{ fontSize: 'clamp(34px, 5vw, 60px)' }} data-testid="guide-title">{post.title}</h1>
            <p className="nw-muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 14, margin: 0 }}>
              {post.author ? <span>{post.author}</span> : null}
              {post.published_at ? <time dateTime={post.published_at}>{format(new Date(post.published_at), 'MMMM d, yyyy')}</time> : null}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock size={14} aria-hidden /> {readMins} min read</span>
            </p>
          </div>
        </section>

        <section className="nw-section" style={{ paddingTop: 40 }}>
          <div className="nw-wrap" style={{ maxWidth: 820 }}>
            {post.cover_image_url ? <img src={post.cover_image_url} alt={post.cover_image_alt ?? post.title} style={{ width: '100%', borderRadius: 16, aspectRatio: '1200/630', objectFit: 'cover', marginBottom: 32 }} /> : null}
            {showToc ? (
              <nav aria-label="Table of contents" className="nw-note" style={{ marginBottom: 32 }} data-testid="guide-toc">
                <p className="nw-eyebrow" style={{ marginBottom: 8 }}>On this page</p>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                  {toc.map((t) => <li key={t.id} style={{ paddingLeft: t.level === 3 ? 14 : 0 }}><a href={`#${t.id}`} style={{ textDecoration: 'underline' }}>{t.text}</a></li>)}
                </ul>
              </nav>
            ) : null}
            <div className="nw-article" dangerouslySetInnerHTML={{ __html: bodyHtml }} data-testid="guide-body" />
            <BlogSocialEmbeds instagramHtml={instagramHtml} tiktokHtml={tiktokHtml} />
          </div>
        </section>

        {mentioned.listings.length > 0 ? (
          <section className="nw-section" style={{ paddingTop: 0 }}>
            <div className="nw-wrap"><MentionedListings listings={mentioned.listings} cats={mentioned.cats} /></div>
          </section>
        ) : null}

        <section className="nw-section" style={{ paddingTop: 0 }}>
          <div className="nw-wrap" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href={`/${hub}/guides`} className="nw-btn ghost">← All {copy.name} guides</Link>
            <Link href={`/${hub}`} className="nw-btn primary">Meet the room</Link>
          </div>
        </section>
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
