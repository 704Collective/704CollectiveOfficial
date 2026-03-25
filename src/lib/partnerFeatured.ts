import { createClient } from '@/lib/supabase/server';

export type FeaturedPartnerLogo = { id: string; company_name: string; logo_url: string | null };

export async function getFeaturedPartnerLogos(): Promise<FeaturedPartnerLogo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('partner_listings')
    .select('id, company_name, logo_url')
    .eq('is_featured', true)
    .order('featured_order', { ascending: true, nullsFirst: false });
  return (data as FeaturedPartnerLogo[]) ?? [];
}
