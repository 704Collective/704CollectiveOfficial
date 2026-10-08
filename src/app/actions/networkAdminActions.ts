'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { networkServiceClient, sendNetworkEmail } from '@/lib/network/server';
import { HUB_COPY, isHub } from '@/lib/network/hubs';

type Gate = { ok: true; admin: ReturnType<typeof networkServiceClient>; userId: string } | { ok: false; error: string };

async function requireAdmin(): Promise<Gate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = networkServiceClient();
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).is('deleted_at', null).maybeSingle();
  if (!prof || !['admin', 'super_admin'].includes(prof.role)) return { ok: false, error: 'Forbidden' };
  return { ok: true, admin, userId: user.id };
}

const hubName = (hub: string) => (isHub(hub) ? HUB_COPY[hub].name : hub);
const firstName = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/)[0] || 'there';

/** Approve + send payment link (also used for re-send). Calls the create-listing-checkout edge function with the service role. */
export async function approveAndSendPaymentLink(applicationId: string): Promise<{ ok: true; url: string; expires_at: string; email_status: number } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const base = process.env.SUPABASE_FUNCTIONS_URL ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  try {
    const res = await fetch(`${base}/create-listing-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ application_id: applicationId, actor_profile_id: gate.userId }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; expires_at?: string; email_status?: number; error?: string };
    if (!res.ok || !j.ok || !j.url) return { ok: false, error: j.error ?? `create-listing-checkout failed (${res.status})` };
    return { ok: true, url: j.url, expires_at: j.expires_at ?? '', email_status: j.email_status ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function waitlistApplication(applicationId: string): Promise<{ ok: true; email_status: number } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { data: app, error } = await gate.admin
    .from('network_listing_applications')
    .update({ status: 'waitlisted', reviewed_at: new Date().toISOString(), reviewed_by: gate.userId })
    .eq('id', applicationId)
    .select('business_name, hub, category_text, contact_name, contact_email')
    .single();
  if (error || !app) return { ok: false, error: error?.message ?? 'Not found' };
  const email_status = await sendNetworkEmail(
    app.contact_email,
    `${hubName(app.hub)}: you're on the waitlist for ${app.category_text}`,
    [
      `Thanks for applying to list ${app.business_name} on ${hubName(app.hub)}.`,
      '',
      `The ${app.category_text} seat on that hub is held right now, so we've placed you on the waitlist. Seats reopen when a business cancels or slips below the bar at a quarterly review, and we offer them in waitlist order.`,
      '',
      "We'll email you the moment yours opens. Nothing is needed from you until then.",
    ].join('\n'),
    firstName(app.contact_name),
  );
  return { ok: true, email_status };
}

export async function declineApplication(applicationId: string, reason: string): Promise<{ ok: true; email_status: number } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleanReason = reason.trim().slice(0, 1000);
  if (!cleanReason) return { ok: false, error: 'A decline reason is required.' };
  const { data: app, error } = await gate.admin
    .from('network_listing_applications')
    .update({ status: 'declined', decline_reason: cleanReason, reviewed_at: new Date().toISOString(), reviewed_by: gate.userId })
    .eq('id', applicationId)
    .select('business_name, hub, contact_name, contact_email')
    .single();
  if (error || !app) return { ok: false, error: error?.message ?? 'Not found' };
  const email_status = await sendNetworkEmail(
    app.contact_email,
    `About your application to ${hubName(app.hub)}`,
    [
      `Thank you for applying to list ${app.business_name} on ${hubName(app.hub)}. We read every application by hand, and we're not able to list you right now.`,
      '',
      `Here's the honest reason: ${cleanReason}`,
      '',
      'This is not a judgment on the business — it is where it sits against our rubric today. If that changes, you are welcome to apply again; we re-review quarterly and the bar is published at 704collective.com/how-we-vet.',
      '',
      '— the 704 team',
    ].join('\n'),
    firstName(app.contact_name),
  );
  return { ok: true, email_status };
}

// ── Wave H5: pending-edit review + invites ───────────────────────────────────

const CONTENT_FIELDS = ['company_name', 'hook', 'description', 'neighborhood', 'website_url', 'instagram_url', 'phone', 'logo_url', 'photo_urls'] as const;

async function listingOwner(admin: ReturnType<typeof networkServiceClient>, ownerId: string | null) {
  if (!ownerId) return null;
  const { data } = await admin.from('profiles').select('email, full_name').eq('id', ownerId).is('deleted_at', null).maybeSingle();
  return data?.email ? { email: data.email as string, first: firstName(data.full_name) } : null;
}

/** Apply pending_content onto the live content columns, clear pending, stamp updated_at. Owner notified. */
export async function applyPendingContent(listingId: string): Promise<{ ok: true; applied: string[]; email_status: number | null } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { data: l } = await gate.admin.from('network_listings').select('id, company_name, hub, slug, owner_profile_id, pending_content').eq('id', listingId).maybeSingle();
  if (!l) return { ok: false, error: 'Not found' };
  const pending = (l.pending_content ?? null) as Record<string, unknown> | null;
  if (!pending || Object.keys(pending).length === 0) return { ok: false, error: 'No pending edit.' };
  const patch: Record<string, unknown> = { pending_content: null, pending_submitted_at: null, updated_at: new Date().toISOString() };
  const applied: string[] = [];
  for (const k of CONTENT_FIELDS) if (k in pending) { patch[k] = pending[k]; applied.push(k); }
  if (typeof patch.company_name === 'string' && !patch.company_name.trim()) delete patch.company_name;
  const { error } = await gate.admin.from('network_listings').update(patch).eq('id', listingId);
  if (error) return { ok: false, error: error.message };
  // Public hub pages are ISR; make the change visible now rather than at the next revalidate window.
  try { revalidatePath(`/${l.hub}`); revalidatePath(`/${l.hub}/${l.slug}`); } catch { /* not in a request scope */ }
  const owner = await listingOwner(gate.admin, l.owner_profile_id);
  const email_status = owner ? await sendNetworkEmail(owner.email, `Your ${hubName(l.hub)} listing edits are live`, [
    `The edits you submitted for ${l.company_name} passed review and are live now.`, '', `Updated: ${applied.join(', ')}`, '',
    `See it live: ${(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com').replace(/\/$/, '')}/${l.hub}/${l.slug}`,
  ].join('\n'), owner.first) : null;
  return { ok: true, applied, email_status };
}

/** Discard pending_content (live row untouched). Owner notified with the optional reason. */
export async function discardPendingContent(listingId: string, reason?: string): Promise<{ ok: true; email_status: number | null } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { data: l } = await gate.admin.from('network_listings').select('id, company_name, hub, owner_profile_id, pending_content').eq('id', listingId).maybeSingle();
  if (!l) return { ok: false, error: 'Not found' };
  if (!l.pending_content) return { ok: false, error: 'No pending edit.' };
  const { error } = await gate.admin.from('network_listings').update({ pending_content: null, pending_submitted_at: null }).eq('id', listingId);
  if (error) return { ok: false, error: error.message };
  const cleanReason = (reason ?? '').trim().slice(0, 600);
  const owner = await listingOwner(gate.admin, l.owner_profile_id);
  const email_status = owner ? await sendNetworkEmail(owner.email, `About your ${hubName(l.hub)} listing edits`, [
    `We reviewed the edits you submitted for ${l.company_name} and did not publish them.`, '',
    cleanReason ? `Why: ${cleanReason}` : 'They did not fit the listing rubric as written.', '',
    'Your live listing is unchanged. You can submit a new edit from My Listing any time.',
  ].join('\n'), owner.first) : null;
  return { ok: true, email_status };
}

/** Re-send the listing-account invite: a fresh set-password link to the owner. */
export async function resendListingInvite(listingId: string): Promise<{ ok: true; email: string; email_status: number } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { data: l } = await gate.admin.from('network_listings').select('company_name, hub, owner_profile_id').eq('id', listingId).maybeSingle();
  if (!l?.owner_profile_id) return { ok: false, error: 'Listing has no owner account.' };
  const owner = await listingOwner(gate.admin, l.owner_profile_id);
  if (!owner) return { ok: false, error: 'Owner profile has no email.' };
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://704collective.com').replace(/\/$/, '');
  // token_hash through our own /auth/callback (server-side verify) - the PKCE browser client cannot consume GoTrue's implicit action_link.
  const { data: link, error } = await gate.admin.auth.admin.generateLink({ type: 'recovery', email: owner.email, options: { redirectTo: `${site}/auth/callback` } });
  if (error || !link?.properties?.hashed_token) return { ok: false, error: error?.message ?? 'Could not generate link' };
  const inviteUrl = `${site}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`;
  const email_status = await sendNetworkEmail(owner.email, `Your 704 listing account for ${l.company_name}`, [
    `Here is a fresh sign-in link for the listing account that manages ${l.company_name} on ${hubName(l.hub)}.`, '',
    `Set your password and sign in: ${inviteUrl}`, '',
    'The link is single-use. From your listing account you can edit your listing, see your intros and manage billing.',
  ].join('\n'), owner.first);
  return { ok: true, email: owner.email, email_status };
}

/** Reopen a declined/waitlisted application for review (no email). */
export async function reopenApplication(applicationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.admin.from('network_listing_applications').update({ status: 'reviewing', decline_reason: null }).eq('id', applicationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
