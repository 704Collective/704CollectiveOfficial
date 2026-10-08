import { getMyListings } from '@/app/actions/networkPortalActions';
import { BillingPanel } from '@/components/network/portal/BillingPanel';

export const dynamic = 'force-dynamic';

export default async function ListingBillingPage() {
  const r = await getMyListings();
  if (!r.ok) return <p className="text-sm text-white/60">{r.error}</p>;
  return <BillingPanel listings={r.listings} />;
}
