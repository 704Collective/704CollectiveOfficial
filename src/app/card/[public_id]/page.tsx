import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { CardDisplay, type BusinessCardData } from '@/components/portal/BusinessCard';

interface Props {
  params: Promise<{ public_id: string }>;
}

async function getCard(publicId: string): Promise<BusinessCardData | null> {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await adminClient
    .from('business_cards')
    .select('*')
    .eq('public_id', publicId)
    .maybeSingle();
  return (data as BusinessCardData) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { public_id } = await params;
  const card = await getCard(public_id);
  if (!card) return { title: 'Card Not Found | 704 Collective' };
  return {
    title: `${card.full_name} | 704 Collective`,
    description: [card.title, card.company].filter(Boolean).join(' · '),
    openGraph: {
      title: `${card.full_name} | 704 Collective`,
      description: [card.title, card.company].filter(Boolean).join(' · '),
      images: card.avatar_url ? [{ url: card.avatar_url }] : [],
    },
  };
}

export default async function PublicCardPage({ params }: Props) {
  const { public_id } = await params;
  const card = await getCard(public_id);

  if (!card) notFound();

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <div className="mb-8 text-center">
        <p className="text-[#D4A853]/60 text-xs tracking-[0.3em] uppercase font-semibold mb-1">
          704 Collective
        </p>
        <p className="text-white/30 text-xs">Digital Business Card</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        <CardDisplay card={card} />
      </div>

      {/* CTA */}
      <div className="mt-12 text-center max-w-sm">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />
        <p className="text-white/40 text-sm mb-3">
          Connect with Charlotte&apos;s premier business community.
        </p>
        <a
          href="https://704collective.com"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D4A853] hover:bg-[#B8923F] text-[#1A1A1A] text-sm font-semibold rounded-lg transition-colors"
        >
          Join 704 Collective
        </a>
        <p className="text-white/20 text-xs mt-4">© 704 Collective · Charlotte, NC</p>
      </div>
    </div>
  );
}
