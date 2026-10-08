import { LeadsDashboard } from '@/components/network/portal/LeadsDashboard';

export const dynamic = 'force-dynamic';

/** Wave H5 - the listing account's intros (scoped by ownership inside the server action). */
export default function ListingLeadsPage() {
  return <LeadsDashboard intro="Every intro 704 sent to your listing, counted. Mark them Won or Lost so your renewal story writes itself." />;
}
