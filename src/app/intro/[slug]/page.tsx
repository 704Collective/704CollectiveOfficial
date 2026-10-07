import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { NetworkShell } from '@/components/network/NetworkShell';
import { HubNav } from '@/components/network/HubNav';
import { HubFooter } from '@/components/network/HubSections';
import { IntroForm } from '@/components/network/IntroForm';
import { hubPagesLive } from '@/lib/network/flags';
import { HUB_COPY, isVisibleHub, type HubSlug } from '@/lib/network/hubs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Request an intro' };

type Props = { params: Promise<{ slug: string }> };

async function liveListing(slug: string) {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await anon.from('network_listings').select('id, hub, slug, company_name, kind, hook').eq('slug', slug).eq('status', 'live').maybeSingle();
  return data as { id: string; hub: HubSlug; slug: string; company_name: string; kind: string; hook: string | null } | null;
}

export default async function IntroPage({ params }: Props) {
  const { slug } = await params;
  if (!hubPagesLive()) notFound();
  const l = await liveListing(slug);
  if (!l || !isVisibleHub(l.hub)) notFound();
  return (
    <NetworkShell hub={l.hub}>
      <HubNav current={l.hub} />
      <main id="main-content" className="nw-wrap" style={{ padding: '56px 24px 80px' }}>
        <div className="nw-two">
          <div>
            <Link href={`/${l.hub}/${l.slug}`} className="nw-eyebrow">← {l.company_name}</Link>
            <span className={`nw-badge ${l.kind === 'seat' ? 'solid' : 'outline'}`} style={{ marginLeft: 12 }}>{l.kind === 'seat' ? 'Exclusive' : 'Vetted'}</span>
            <h1 className="nw-serif nw-h1" style={{ fontSize: 'clamp(34px, 5vw, 56px)' }}>Request an intro to {l.company_name}.</h1>
            <p className="nw-promise">{l.hook ?? `A ${HUB_COPY[l.hub].name} business that passed the 704 Review.`}</p>
          </div>
          <IntroForm slug={l.slug} companyName={l.company_name} />
        </div>
      </main>
      <HubFooter />
    </NetworkShell>
  );
}
