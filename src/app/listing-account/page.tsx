import { getMyListings } from '@/app/actions/networkPortalActions';
import { MyListingPanel } from '@/components/network/portal/MyListingPanel';
import { hubPagesLive } from '@/lib/network/flags';

export const dynamic = 'force-dynamic';

/** Wave H5 - My Listing (was the H4 holding page). */
export default async function ListingAccountPage() {
  const r = await getMyListings();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
  if (!r.ok) return <p className="text-sm text-white/60">{r.error}</p>;
  const first = r.caller.fullName?.split(' ')[0] || 'there';
  if (r.listings.length === 0) {
    return (
      <section data-testid="my-listing-empty">
        <h1 className="text-2xl font-bold sm:text-3xl">Hey {first}, you&apos;re in.</h1>
        <p className="mt-2 max-w-xl text-sm text-white/60">No listing is attached to this account yet. If you just paid, give it a minute - your draft is being created. Otherwise email <a className="underline" href="mailto:hello@704collective.com">hello@704collective.com</a>.</p>
      </section>
    );
  }
  return (
    <div className="space-y-12">
      {r.listings.map((l) => <MyListingPanel key={l.id} listing={l} siteUrl={site} publicLive={hubPagesLive()} />)}
    </div>
  );
}
