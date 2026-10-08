'use server';

// Wave H5 - server actions behind the member "My Leads" dashboard, the
// listing-only portal and the in-portal Network view. Every action resolves
// the caller from the session cookie, then works with the service role scoped
// to listings the caller owns (or everything for admins). Owners never touch
// the live content columns: edits land in pending_content only.

import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { networkServiceClient, sendNetworkEmail, clip } from '@/lib/network/server';
import { HUB_COPY, isHub, isVisibleHub } from '@/lib/network/hubs';
import { hubPagesLive } from '@/lib/network/flags';
import { rangeSince, sanitizeListingContent, LISTING_CONTENT_FIELDS, type Caller, type LeadsRange, type LeadRow, type LeadsListing, type LeadsDashboardData, type ListingContent, type PortalListing, type NetworkViewListing } from '@/lib/network/portal';

async function caller(): Promise<Caller | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = networkServiceClient();
  const { data: prof } = await admin.from('profiles').select('role, member_type, full_name, email').eq('id', user.id).is('deleted_at', null).maybeSingle();
  if (!prof) return null;
  return { userId: user.id, email: prof.email ?? user.email ?? '', fullName: prof.full_name ?? null, memberType: prof.member_type ?? null, isAdmin: ['admin', 'super_admin'].includes(prof.role) };
}

/** Listings the caller may act on: admins see all, everyone else their own. */
async function ownedListingIds(c: Caller): Promise<string[]> {
  const admin = networkServiceClient();
  let q = admin.from('network_listings').select('id');
  if (!c.isAdmin) q = q.eq('owner_profile_id', c.userId);
  const { data } = await q;
  return (data ?? []).map((r) => r.id as string);
}

// -- My Leads ---------------------------------------------------------------

export async function getLeadsDashboard(range: LeadsRange = '90', opts?: { listingId?: string }): Promise<{ ok: true; data: LeadsDashboardData } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const admin = networkServiceClient();
  let lq = admin.from('network_listings').select('id, company_name, slug, hub, kind, status').order('created_at');
  if (!c.isAdmin) lq = lq.eq('owner_profile_id', c.userId);
  if (opts?.listingId) lq = lq.eq('id', opts.listingId);
  const { data: listings } = await lq;
  const ids = (listings ?? []).map((l) => l.id as string);
  const since = rangeSince(range);
  if (ids.length === 0) return { ok: true, data: { range, since: since.toISOString(), listings: [], leads: [], clicks: 0, clicksByTarget: {}, sources: [], stats: { intros: 0, clicks: 0, won: 0, avgReplyHours: null, replied: 0 } } };

  const [{ data: leads }, { data: clicks }] = await Promise.all([
    admin.from('network_leads').select('id, listing_id, lead_name, lead_email, lead_phone, need, message, source, utm_source, utm_medium, status, first_replied_at, status_changed_at, created_at').in('listing_id', ids).gte('created_at', since.toISOString()).order('created_at', { ascending: false }),
    admin.from('network_click_events').select('target').in('listing_id', ids).gte('created_at', since.toISOString()),
  ]);
  const L = (leads ?? []) as LeadRow[];
  const clicksByTarget: Record<string, number> = {};
  for (const k of clicks ?? []) clicksByTarget[k.target] = (clicksByTarget[k.target] ?? 0) + 1;
  const srcMap: Record<string, number> = {};
  for (const l of L) { const key = l.utm_source?.trim().toLowerCase() || (l.source === 'network' ? 'member portal' : l.source === 'hub_page' ? 'hub page' : l.source || 'direct'); srcMap[key] = (srcMap[key] ?? 0) + 1; }
  const sources = Object.entries(srcMap).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const replied = L.filter((l) => l.first_replied_at);
  const avgReplyHours = replied.length ? replied.reduce((s, l) => s + (new Date(l.first_replied_at!).getTime() - new Date(l.created_at).getTime()) / 36e5, 0) / replied.length : null;
  return { ok: true, data: { range, since: since.toISOString(), listings: (listings ?? []) as LeadsListing[], leads: L, clicks: (clicks ?? []).length, clicksByTarget, sources, stats: { intros: L.length, clicks: (clicks ?? []).length, won: L.filter((l) => l.status === 'won').length, avgReplyHours, replied: replied.length } } };
}

async function leadForCaller(c: Caller, leadId: string) {
  const admin = networkServiceClient();
  const { data: lead } = await admin.from('network_leads').select('id, listing_id, status, first_replied_at').eq('id', leadId).maybeSingle();
  if (!lead) return null;
  if (!c.isAdmin) { const ids = await ownedListingIds(c); if (!ids.includes(lead.listing_id)) return null; }
  return lead;
}

/** Won / Lost: sets status + status_changed_at; a decision counts as a reply, so first_replied_at is stamped if still null. */
export async function setLeadStatus(leadId: string, status: 'won' | 'lost' | 'new'): Promise<{ ok: true; lead: Pick<LeadRow, 'id' | 'status' | 'status_changed_at' | 'first_replied_at'> } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const lead = await leadForCaller(c, leadId);
  if (!lead) return { ok: false, error: 'Not found' };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, status_changed_at: now };
  if (!lead.first_replied_at && status !== 'new') patch.first_replied_at = now;
  const { data, error } = await networkServiceClient().from('network_leads').update(patch).eq('id', leadId).select('id, status, status_changed_at, first_replied_at').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Update failed' };
  return { ok: true, lead: data as never };
}

/** "Mark contacted": stamps first_replied_at exactly once; never moves status. */
export async function markLeadContacted(leadId: string): Promise<{ ok: true; first_replied_at: string; already: boolean } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const lead = await leadForCaller(c, leadId);
  if (!lead) return { ok: false, error: 'Not found' };
  if (lead.first_replied_at) return { ok: true, first_replied_at: lead.first_replied_at, already: true };
  const now = new Date().toISOString();
  const { error } = await networkServiceClient().from('network_leads').update({ first_replied_at: now }).eq('id', leadId).is('first_replied_at', null);
  if (error) return { ok: false, error: error.message };
  return { ok: true, first_replied_at: now, already: false };
}

// -- Listing portal ---------------------------------------------------------

export async function getMyListings(): Promise<{ ok: true; listings: PortalListing[]; caller: Caller } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const { data, error } = await networkServiceClient().from('network_listings')
    .select('id, kind, hub, slug, status, verified_at, billing_status, rate_cents, rate_locked_until, stripe_customer_id, company_name, hook, description, neighborhood, website_url, instagram_url, phone, logo_url, photo_urls, pending_content, pending_submitted_at, updated_at, category:network_categories(label, slug)')
    .eq('owner_profile_id', c.userId).order('created_at');
  if (error) return { ok: false, error: error.message };
  const listings = (data ?? []).map((r) => ({ ...r, category: Array.isArray(r.category) ? r.category[0] ?? null : r.category })) as unknown as PortalListing[];
  return { ok: true, listings, caller: c };
}

/** Owner submits edits -> pending_content only. Live columns are never written here. */
export async function submitListingEdits(listingId: string, content: ListingContent): Promise<{ ok: true; pending_content: ListingContent; pending_submitted_at: string; email_status: number } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const admin = networkServiceClient();
  const { data: listing } = await admin.from('network_listings').select('id, owner_profile_id, company_name, hub, slug, hook, description, neighborhood, website_url, instagram_url, phone, logo_url, photo_urls').eq('id', listingId).maybeSingle();
  if (!listing || (!c.isAdmin && listing.owner_profile_id !== c.userId)) return { ok: false, error: 'Not found' };
  const clean = sanitizeListingContent(content);
  // Only keep fields that actually differ from the live row.
  const diff: ListingContent = {};
  for (const k of LISTING_CONTENT_FIELDS) {
    if (!(k in clean)) continue;
    const live = (listing as Record<string, unknown>)[k] ?? null;
    const next = (clean as Record<string, unknown>)[k] ?? null;
    if (JSON.stringify(live) !== JSON.stringify(next)) (diff as Record<string, unknown>)[k] = next;
  }
  if (Object.keys(diff).length === 0) return { ok: false, error: 'Nothing changed.' };
  const now = new Date().toISOString();
  const { error } = await admin.from('network_listings').update({ pending_content: diff, pending_submitted_at: now }).eq('id', listingId);
  if (error) return { ok: false, error: error.message };
  const hubName = isHub(listing.hub) ? HUB_COPY[listing.hub].name : listing.hub;
  const email_status = await sendNetworkEmail(
    process.env.NETWORK_ADMIN_EMAIL ?? 'hello@704collective.com',
    `Listing edit to review: ${listing.company_name} (${hubName})`,
    [`${listing.company_name} submitted edits to their ${hubName} listing.`, '', ...Object.entries(diff).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v ?? '-'}`), '', `Review at /admin/network -> Listings. Listing id: ${listing.id}`].join('\n'),
    'team',
  );
  return { ok: true, pending_content: diff, pending_submitted_at: now, email_status };
}

/** Owner withdraws their own pending edit (no email). */
export async function withdrawListingEdits(listingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const admin = networkServiceClient();
  const { data: listing } = await admin.from('network_listings').select('owner_profile_id').eq('id', listingId).maybeSingle();
  if (!listing || (!c.isAdmin && listing.owner_profile_id !== c.userId)) return { ok: false, error: 'Not found' };
  const { error } = await admin.from('network_listings').update({ pending_content: null, pending_submitted_at: null }).eq('id', listingId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Stripe billing portal for the listing's customer. Against develop only a test key is accepted. */
export async function createListingBillingPortal(listingId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: 'Billing is not configured.' };
  const isDevelop = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('rlypudgmskdonxjtjreb');
  if (isDevelop && !key.startsWith('sk_test_')) return { ok: false, error: 'Refusing: non-test Stripe key against develop.' };
  const admin = networkServiceClient();
  const { data: listing } = await admin.from('network_listings').select('owner_profile_id, stripe_customer_id').eq('id', listingId).maybeSingle();
  if (!listing || (!c.isAdmin && listing.owner_profile_id !== c.userId)) return { ok: false, error: 'Not found' };
  if (!listing.stripe_customer_id) return { ok: false, error: 'No billing customer on this listing yet.' };
  try {
    const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com';
    const session = await stripe.billingPortal.sessions.create({ customer: listing.stripe_customer_id, return_url: `${site}/listing-account/billing` });
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// -- The Network (portal view) ----------------------------------------------

export async function getNetworkView(): Promise<{ ok: true; listings: NetworkViewListing[]; caller: Caller; publicLive: boolean } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  const { data, error } = await networkServiceClient().from('network_listings').select('id, kind, hub, slug, company_name, hook, neighborhood, logo_url, verified_at, category:network_categories(label, slug)').eq('status', 'live').order('kind').order('company_name');
  if (error) return { ok: false, error: error.message };
  const listings = (data ?? []).filter((r) => isVisibleHub(r.hub)).map((r) => ({ ...r, category: Array.isArray(r.category) ? r.category[0] ?? null : r.category })) as unknown as NetworkViewListing[];
  return { ok: true, listings, caller: c, publicLive: hubPagesLive() };
}

/** In-portal intro: source='network', from_profile_id + member name/email from the profile. */
export async function requestPortalIntro(listingId: string, input: { need?: string; message?: string; phone?: string }): Promise<{ ok: true; lead_id: string; email_status: number | 'no-owner' } | { ok: false; error: string }> {
  const c = await caller();
  if (!c) return { ok: false, error: 'Unauthorized' };
  if (!c.email) return { ok: false, error: 'Your account has no email on file.' };
  const admin = networkServiceClient();
  const { data: listing } = await admin.from('network_listings').select('id, hub, slug, company_name, status, owner_profile_id').eq('id', listingId).maybeSingle();
  if (!listing || listing.status !== 'live' || !isVisibleHub(listing.hub)) return { ok: false, error: 'This listing is not accepting intros.' };
  if (listing.owner_profile_id === c.userId) return { ok: false, error: "That's your own listing." };
  const leadName = c.fullName?.trim() || c.email;
  const { data: lead, error } = await admin.from('network_leads').insert({
    listing_id: listing.id, lead_name: leadName, lead_email: c.email, lead_phone: clip(input.phone, 40), need: clip(input.need, 300), message: clip(input.message, 2000),
    from_profile_id: c.userId, source: 'network', utm_source: 'portal', utm_medium: 'network', landing_path: '/dashboard/network',
  }).select('id').single();
  if (error || !lead) return { ok: false, error: error?.message ?? 'Could not save your request.' };
  let email_status: number | 'no-owner' = 'no-owner';
  if (listing.owner_profile_id) {
    const { data: owner } = await admin.from('profiles').select('email, full_name').eq('id', listing.owner_profile_id).is('deleted_at', null).maybeSingle();
    if (owner?.email) {
      email_status = await sendNetworkEmail(owner.email, 'You have a new intro from a 704 member', [
        `${leadName} - a 704 member - asked for an intro to ${listing.company_name} from inside the member portal.`, '',
        `Name: ${leadName}`, `Email: ${c.email}`, input.phone ? `Phone: ${clip(input.phone, 40)}` : null, input.need ? `Need: ${clip(input.need, 300)}` : null, input.message ? `\n${clip(input.message, 2000)}` : null,
        '', 'Reply to them directly. This intro is counted toward your listing.',
      ].filter((l) => l !== null).join('\n'), owner.full_name?.split(' ')[0] ?? 'there');
    }
  }
  return { ok: true, lead_id: lead.id, email_status };
}
