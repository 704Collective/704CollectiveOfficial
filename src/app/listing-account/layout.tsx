import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { networkServiceClient } from '@/lib/network/server';
import { ListingPortalShell } from '@/components/network/portal/ListingPortalShell';

export const metadata: Metadata = { title: 'Listing account · 704 Collective', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Wave H5 listing-only portal. Middleware already pins member_type='listing'
 * accounts under /listing-account and bounces other members away; this layout
 * re-checks with the service role (admins may look in) and renders the shell.
 */
export default async function ListingAccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/listing-account');
  const { data: profile } = await networkServiceClient().from('profiles').select('full_name, member_type, role').eq('id', user.id).maybeSingle();
  const isAdmin = ['admin', 'super_admin'].includes(profile?.role ?? '');
  if (profile?.member_type !== 'listing' && !isAdmin) redirect('/dashboard');
  return <ListingPortalShell name={profile?.full_name ?? null}>{children}</ListingPortalShell>;
}
