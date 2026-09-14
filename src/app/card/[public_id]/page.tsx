import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { CardDisplay, type BusinessCardData } from '@/components/portal/BusinessCard';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import {
  isVisibleMember,
  MEMBER_VISIBILITY_COLUMNS,
  type MemberVisibilityFields,
} from '@/lib/memberVisibility';

interface Props {
  params: Promise<{ public_id: string }>;
}

/**
 * Read gate for the public card (R5). The card row itself is public via the
 * SECURITY DEFINER RPC, but `profiles` is not readable by anon, so the owner's
 * membership state is checked server-side with the service role. A card whose
 * owner fails the shared member-visibility predicate resolves to not-found;
 * the card row is never deleted, so a reactivated member's URL works again.
 */
async function ownerIsVisibleMember(userId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('[card] SUPABASE_SERVICE_ROLE_KEY missing; refusing to serve card without owner check');
    return false;
  }
  const admin = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from('profiles')
    .select(MEMBER_VISIBILITY_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[card] owner profile lookup failed', error.message);
    return false;
  }
  return isVisibleMember(data as MemberVisibilityFields | null);
}

// `cache` dedupes the metadata + page calls within one request.
const getCard = cache(async (publicId: string): Promise<BusinessCardData | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_business_card_public', { pid: publicId }).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  if (!(await ownerIsVisibleMember(String(row.user_id)))) return null;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    public_id: String(row.public_id),
    full_name: (row.full_name as string) || 'Member',
    title: (row.title as string) ?? null,
    company: (row.company as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    linkedin_url: (row.linkedin_url as string) ?? null,
    website_url: (row.website_url as string) ?? null,
    avatar_url: (row.avatar_url as string) ?? null,
    custom_fields: (row.custom_fields as Record<string, string>) ?? null,
  };
});

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
      <MarketingPageRoot>
      <div className="mb-8 text-center">
        <p className="text-[#C6A664]/70 text-xs tracking-[0.35em] uppercase font-semibold mb-1">
          704 Collective
        </p>
        <p className="text-white/35 text-xs">Digital business card</p>
      </div>

      <div className="w-full max-w-md">
        <CardDisplay card={card} />
      </div>

      <div className="mt-12 text-center max-w-sm">
        <div className="h-px bg-gradient-to-r from-transparent via-[#C6A664]/25 to-transparent mb-8" />
        <p className="text-white/45 text-sm mb-5 leading-relaxed">
          Connect with Charlotte&apos;s premier young professional and business community.
        </p>
        <Link
          href="https://704collective.com"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C6A664] hover:bg-[#C6A664] text-[#1A1A1A] text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-black/20"
        >
          Join 704 Collective
        </Link>
        <p className="text-white/25 text-xs mt-6">© 704 Collective · Charlotte, NC</p>
      </div>
      </MarketingPageRoot>
    </div>
  );
}
