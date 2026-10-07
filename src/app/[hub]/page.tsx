import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/JsonLd';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { BattleCry, CategoryRibbon, EventTeaser, FromTheHub, GetListedCta, HubFaq, HubFooter, HubHero, Signature, TheRoom, VettedGrid, VettingBand } from '@/components/network/HubSections';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isVisibleHub } from '@/lib/network/hubs';
import { getHubCategories, getHubListings, getHubPosts, getNextEvent } from '@/lib/network/queries';

export const revalidate = 60;

const SITE = 'https://704collective.com';
type Props = { params: Promise<{ hub: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub } = await params;
  if (!hubPagesLive() || !isVisibleHub(hub)) return { robots: { index: false, follow: false } };
  const c = HUB_COPY[hub];
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: { canonical: `${SITE}/${hub}` },
    openGraph: { title: c.metaTitle, description: c.metaDescription, url: `${SITE}/${hub}`, siteName: '704 Collective', type: 'website' },
    twitter: { card: 'summary_large_image', title: c.metaTitle, description: c.metaDescription },
  };
}

export default async function HubPage({ params }: Props) {
  const { hub } = await params;
  // Launch flag first; then the constant list (enterprise/hall/lab 404 until promoted).
  if (!hubPagesLive() || !isVisibleHub(hub)) notFound();

  const copy = HUB_COPY[hub];
  const [cats, listings, posts, event] = await Promise.all([getHubCategories(hub), getHubListings(hub), getHubPosts(hub), getNextEvent()]);
  const ribbon = cats.length ? cats.map((c) => c.label) : copy.ribbonFallback;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${copy.name} — vetted by 704 Collective`,
    url: `${SITE}/${hub}`,
    numberOfItems: listings.length,
    itemListElement: listings.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/${hub}/${l.slug}`,
      item: { '@type': 'LocalBusiness', name: l.company_name, url: `${SITE}/${hub}/${l.slug}`, ...(l.neighborhood ? { areaServed: l.neighborhood } : {}) },
    })),
  };

  return (
    <NetworkShell hub={hub}>
      <JsonLd schema={itemList} />
      <HubNav current={hub} />
      <main id="main-content">
        <HubHero copy={copy} />
        <CategoryRibbon items={ribbon} />
        <VettingBand line={copy.trustLine} />
        <TheRoom cats={cats} listings={listings} />
        <VettedGrid cats={cats} listings={listings} />
        <BattleCry text={copy.battleCry} />
        <Signature sig={copy.signature} />
        <GetListedCta hubName={copy.name} />
        <FromTheHub posts={posts} hubName={copy.name} />
        <HubFaq faqs={copy.faqs} />
        <EventTeaser event={event} />
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
