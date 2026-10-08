'use server';

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

/** Reopen a declined/waitlisted application for review (no email). */
export async function reopenApplication(applicationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await gate.admin.from('network_listing_applications').update({ status: 'reviewing', decline_reason: null }).eq('id', applicationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
