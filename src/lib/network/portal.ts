// Wave H5 — shared types + pure helpers for the portals (no server-only code).
import type { HubSlug } from './hubs';

export type LeadsRange = '90' | '30' | 'year';
export const LEADS_RANGES: { value: LeadsRange; label: string }[] = [
  { value: '90', label: 'Last 90 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
];

export type LeadRow = {
  id: string; listing_id: string; lead_name: string; lead_email: string; lead_phone: string | null; need: string | null; message: string | null;
  source: string | null; utm_source: string | null; utm_medium: string | null; status: 'new' | 'won' | 'lost'; first_replied_at: string | null; status_changed_at: string | null; created_at: string;
};
export type LeadsListing = { id: string; company_name: string; slug: string; hub: string; kind: 'seat' | 'spotlight'; status: string };
export type LeadsDashboardData = {
  range: LeadsRange; since: string; listings: LeadsListing[]; leads: LeadRow[]; clicks: number;
  clicksByTarget: Record<string, number>; sources: { key: string; count: number }[];
  stats: { intros: number; clicks: number; won: number; avgReplyHours: number | null; replied: number };
};
export type Caller = { userId: string; email: string; fullName: string | null; memberType: string | null; isAdmin: boolean };

export const LISTING_CONTENT_FIELDS = ['company_name', 'hook', 'description', 'neighborhood', 'website_url', 'instagram_url', 'phone', 'logo_url', 'photo_urls'] as const;
export type ListingContentField = (typeof LISTING_CONTENT_FIELDS)[number];
export type ListingContent = { company_name?: string; hook?: string | null; description?: string | null; neighborhood?: string | null; website_url?: string | null; instagram_url?: string | null; phone?: string | null; logo_url?: string | null; photo_urls?: string[] | null };
export const LISTING_FIELD_LABELS: Record<ListingContentField, string> = {
  company_name: 'Business name', hook: 'One-line hook', description: 'Description', neighborhood: 'Neighborhood', website_url: 'Website', instagram_url: 'Instagram', phone: 'Phone', logo_url: 'Logo URL', photo_urls: 'Photo URLs',
};

export type PortalListing = {
  id: string; kind: 'seat' | 'spotlight'; hub: HubSlug; slug: string; status: string; verified_at: string | null; billing_status: string | null; rate_cents: number | null; rate_locked_until: string | null; stripe_customer_id: string | null;
  company_name: string; hook: string | null; description: string | null; neighborhood: string | null; website_url: string | null; instagram_url: string | null; phone: string | null; logo_url: string | null; photo_urls: string[] | null;
  category: { label: string; slug: string } | null; pending_content: ListingContent | null; pending_submitted_at: string | null; updated_at: string;
};

export type NetworkViewListing = { id: string; kind: 'seat' | 'spotlight'; hub: HubSlug; slug: string; company_name: string; hook: string | null; neighborhood: string | null; logo_url: string | null; verified_at: string | null; category: { label: string; slug: string } | null };

export const rangeSince = (range: LeadsRange): Date => {
  const d = new Date();
  if (range === 'year') return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  d.setUTCDate(d.getUTCDate() - (range === '30' ? 30 : 90));
  return d;
};

/** Normalize owner-submitted content. Strings trimmed/clipped, URLs given a scheme, IG handles expanded. */
export function sanitizeListingContent(input: ListingContent): ListingContent {
  const out: ListingContent = {};
  const s = (v: unknown, n: number) => (typeof v === 'string' ? (v.trim() ? v.trim().slice(0, n) : null) : null);
  const url = (v: unknown) => { const t = s(v, 300); return t ? (/^https?:\/\//i.test(t) ? t : `https://${t}`) : null; };
  if (typeof input.company_name === 'string' && input.company_name.trim()) out.company_name = input.company_name.trim().slice(0, 120);
  if ('hook' in input) out.hook = s(input.hook, 160);
  if ('description' in input) out.description = s(input.description, 2000);
  if ('neighborhood' in input) out.neighborhood = s(input.neighborhood, 80);
  if ('website_url' in input) out.website_url = url(input.website_url);
  if ('instagram_url' in input) { const t = s(input.instagram_url, 160); out.instagram_url = t ? (/^https?:\/\//i.test(t) ? t : `https://instagram.com/${t.replace(/^@/, '')}`) : null; }
  if ('phone' in input) out.phone = s(input.phone, 40);
  if ('logo_url' in input) out.logo_url = url(input.logo_url);
  if ('photo_urls' in input) out.photo_urls = Array.isArray(input.photo_urls) ? input.photo_urls.map((u) => url(u)).filter((u): u is string => !!u).slice(0, 8) : null;
  return out;
}

/** Public profile URL for a listing (the embed badge + "view live" links). */
export const listingPublicUrl = (site: string, hub: string, slug: string) => `${site.replace(/\/$/, '')}/${hub}/${slug}`;

/** "704 Vetted" embed snippet. Inline styles so it survives any host page. */
export function vettedBadgeSnippet(profileUrl: string, companyName: string): string {
  return `<a href="${profileUrl}?utm_source=badge&utm_medium=embed" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#141412;color:#fff;font:600 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;letter-spacing:.02em"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C6A664"></span>704 Vetted · ${companyName.replace(/</g, '&lt;')}</a>`;
}
