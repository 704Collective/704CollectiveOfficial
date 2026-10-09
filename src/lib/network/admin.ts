// Wave H6 — shared types + pure math for the admin command center (no server code).
import type { HubSlug } from './hubs';
import { businessHoursBetween, isPastPledge, PLEDGE_BUSINESS_DAYS } from './businessDays';
import type { LeadsRange } from './portal';

export type AdminHubFilter = 'all' | HubSlug;
export type SourceBucket = 'hub page' | 'network' | 'blog' | 'other';

export type AttrLead = { id: string; listing_id: string; status: 'new' | 'won' | 'lost'; source: string | null; utm_source: string | null; utm_medium: string | null; landing_path: string | null; created_at: string; first_replied_at: string | null; nudge_sent_at: string | null };
export type AttrListing = { id: string; company_name: string; slug: string; hub: HubSlug; kind: 'seat' | 'spotlight'; status: string; owner_profile_id: string | null };

export type BusinessRow = {
  listing: AttrListing; leads: number; won: number; avgReplyHours: number | null; replied: number;
  openFlags: number; lastNudgeAt: string | null; laggard: boolean; laggardWhy: ('open-flags' | 'slow-replies')[];
};
export type Attribution = {
  range: LeadsRange; hub: AdminHubFilter; since: string;
  tiles: { leads: number; won: number; clicks: number; flags: number };
  byBusiness: BusinessRow[];
  bySource: { bucket: SourceBucket; count: number }[];
  flags: BusinessRow[];
};

/** Lead source bucket: hub page / network / blog / other from source + utm + landing path. */
export function sourceBucket(l: Pick<AttrLead, 'source' | 'utm_source' | 'utm_medium' | 'landing_path'>): SourceBucket {
  const u = `${l.utm_source ?? ''} ${l.utm_medium ?? ''}`.toLowerCase();
  if (/blog/.test(u) || (l.landing_path ?? '').startsWith('/blog')) return 'blog';
  if (l.source === 'network') return 'network';
  if (l.source === 'hub_page') return 'hub page';
  return 'other';
}

/** Pledge in business hours (2 business days × 24h). Average reply slower than this marks a business as slow. */
export const PLEDGE_HOURS = PLEDGE_BUSINESS_DAYS * 24;

export function rollUp(leads: AttrLead[], listings: AttrListing[], clicksByListing: Record<string, number>, now = new Date()): Pick<Attribution, 'tiles' | 'byBusiness' | 'bySource' | 'flags'> {
  const byId = Object.fromEntries(listings.map((l) => [l.id, l]));
  const groups = new Map<string, AttrLead[]>();
  for (const l of leads) { if (!byId[l.listing_id]) continue; (groups.get(l.listing_id) ?? groups.set(l.listing_id, []).get(l.listing_id)!).push(l); }
  const byBusiness: BusinessRow[] = listings.map((listing) => {
    const ls = groups.get(listing.id) ?? [];
    const replied = ls.filter((l) => l.first_replied_at);
    const avgReplyHours = replied.length ? replied.reduce((s, l) => s + businessHoursBetween(l.created_at, l.first_replied_at!), 0) / replied.length : null;
    const open = ls.filter((l) => isPastPledge(l.created_at, l.first_replied_at, now));
    const lastNudgeAt = ls.reduce<string | null>((m, l) => (l.nudge_sent_at && (!m || l.nudge_sent_at > m) ? l.nudge_sent_at : m), null);
    const why: BusinessRow['laggardWhy'] = [];
    if (open.length > 0) why.push('open-flags');
    if (avgReplyHours !== null && avgReplyHours > PLEDGE_HOURS) why.push('slow-replies');
    return { listing, leads: ls.length, won: ls.filter((l) => l.status === 'won').length, avgReplyHours, replied: replied.length, openFlags: open.length, lastNudgeAt, laggard: why.length > 0, laggardWhy: why };
  }).sort((a, b) => b.leads - a.leads || a.listing.company_name.localeCompare(b.listing.company_name));
  const buckets: Record<SourceBucket, number> = { 'hub page': 0, network: 0, blog: 0, other: 0 };
  for (const l of leads) if (byId[l.listing_id]) buckets[sourceBucket(l)]++;
  const tiles = {
    leads: byBusiness.reduce((s, b) => s + b.leads, 0),
    won: byBusiness.reduce((s, b) => s + b.won, 0),
    clicks: listings.reduce((s, l) => s + (clicksByListing[l.id] ?? 0), 0),
    flags: byBusiness.reduce((s, b) => s + b.openFlags, 0),
  };
  return { tiles, byBusiness, bySource: (Object.keys(buckets) as SourceBucket[]).map((bucket) => ({ bucket, count: buckets[bucket] })), flags: byBusiness.filter((b) => b.openFlags > 0).sort((a, b) => b.openFlags - a.openFlags) };
}

export const LISTING_STATUSES = ['draft', 'pending_review', 'live', 'paused', 'removed'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const PASS_SCORE = 40;
export const MAX_SCORE = 50;

export type AdminListing = {
  id: string; kind: 'seat' | 'spotlight'; hub: HubSlug; slug: string; status: ListingStatus; company_name: string; billing_status: string | null; verified_at: string | null; next_review_at: string | null; review_score: number | null; hard_fail: boolean;
  category_id: string; category: { id: string; label: string; slug: string } | null; owner: { email: string | null; full_name: string | null; member_type: string | null } | null;
  pending_content: Record<string, unknown> | null; pending_submitted_at: string | null; updated_at: string; created_at: string;
  hook: string | null; description: string | null; neighborhood: string | null; website_url: string | null; instagram_url: string | null; phone: string | null; logo_url: string | null; photo_urls: string[] | null;
};

export type VettingAlerts = {
  overdue: { listing: AdminListing; daysOverdue: number }[];
  laggards: BusinessRow[];
  counts: { overdue: number; laggards: number; total: number };
};
