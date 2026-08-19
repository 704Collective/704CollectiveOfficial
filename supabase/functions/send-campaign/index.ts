import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendCampaignPayload {
  campaign_id?: string;
  test_email?: string; // when provided, send only to this address (no DB updates)
  count_only?: boolean; // when true, resolve audience and return { count } only — no writes
  audience_type?: string; // used by count_only mode
  audience_event_id?: string | null; // used by count_only mode
}

interface Recipient {
  email: string;
  name: string | null;
  contact_id?: string;
  profile_id?: string;
}

// ===== Block-based email body renderer =====

type BlockType =
  | 'logo' | 'greeting' | 'heading' | 'text' | 'image'
  | 'button' | 'divider' | 'spacer' | 'events_list' | 'signoff' | 'footer';

interface Block {
  id: string;
  type: BlockType;
  content: Record<string, any>;
}

interface RenderContext {
  isTest: boolean;
  upcomingEvents?: Array<{ name: string; date: string; time?: string; location: string; url: string }>;
  senderName: string;
  siteUrl: string;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function preserveNewlines(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

function renderBlock(block: Block, ctx: RenderContext): string {
  const c = block.content ?? {};
  switch (block.type) {
    case 'logo': {
      const logoUrl = 'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/704-logo.png';
      const link = c.link || ctx.siteUrl;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td align="center" style="padding:32px 0 24px;">
          <a href="${escapeHtml(link)}" style="text-decoration:none;">
            <img src="${logoUrl}" alt="704 Collective" width="80" style="display:block;width:80px;height:80px;border:0;border-radius:50%;" />
          </a>
        </td></tr>
      </table>`;
    }

    case 'greeting':
      return `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1A1A1A;margin:8px 0 16px;line-height:1.5;">${preserveNewlines(c.text || '')}</p>`;

    case 'heading': {
      const tag = c.size === 'h1' ? 'h1' : c.size === 'h3' ? 'h3' : 'h2';
      const fontSize = tag === 'h1' ? '24px' : tag === 'h3' ? '16px' : '20px';
      return `<${tag} style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;color:#1A1A1A;margin:24px 0 12px;font-size:${fontSize};line-height:1.3;">${escapeHtml(c.text || '')}</${tag}>`;
    }

    case 'text':
      return `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#444444;margin:0 0 16px;line-height:1.7;white-space:pre-wrap;">${preserveNewlines(c.text || '')}</p>`;

    case 'image': {
      if (!c.url) return '';
      const img = `<img src="${escapeHtml(c.url)}" alt="${escapeHtml(c.alt || '')}" style="display:block;max-width:100%;height:auto;border:0;margin:0 auto;" />`;
      const wrapped = c.link ? `<a href="${escapeHtml(c.link)}" style="text-decoration:none;">${img}</a>` : img;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0;">${wrapped}</td></tr></table>`;
    }

    case 'button': {
      const align = c.align === 'left' ? 'left' : c.align === 'right' ? 'right' : 'center';
      const color = c.color || '#C6A664';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="${align}" style="padding:12px 0;">
        <a href="${escapeHtml(c.url || ctx.siteUrl)}" style="display:inline-block;background-color:${escapeHtml(color)};color:#000000;font-family:Arial,sans-serif;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:8px;">${escapeHtml(c.text || 'Click Here')}</a>
      </td></tr></table>`;
    }

    case 'divider':
      return `<hr style="border:0;border-top:1px solid ${escapeHtml(c.color || '#2E2E2E')};margin:16px 0;" />`;

    case 'spacer':
      return `<div style="height:${Number(c.height) || 24}px;line-height:${Number(c.height) || 24}px;font-size:1px;">&nbsp;</div>`;

    case 'events_list': {
      const title = c.title || 'Upcoming Events';
      const heading = `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;color:#1A1A1A;margin:24px 0 16px;font-size:20px;">${escapeHtml(title)}</p>`;

      if (ctx.isTest) {
        const placeholderCard = (date: string, label: string) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;border:1px solid #EAEAE5;border-radius:12px;margin:0 0 12px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#888;">${escapeHtml(date)}</p>
              <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#1A1A1A;line-height:1.3;font-style:italic;">${escapeHtml(label)}</p>
            </td></tr>
          </table>`;
        const today = new Date();
        const futureDate1 = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000);
        const futureDate2 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
        return heading
          + placeholderCard(fmtDate(futureDate1), 'Live event data will populate when sent')
          + placeholderCard(fmtDate(futureDate2), 'Real upcoming events appear here in the actual send');
      }

      const events = ctx.upcomingEvents ?? [];
      if (events.length === 0) {
        return heading + `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#666;margin:8px 0 24px;">No upcoming events scheduled.</p>`;
      }

      const cards = events.map(e => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;border:1px solid #EAEAE5;border-radius:12px;margin:0 0 12px;">
          <tr><td style="padding:20px;">
            <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#888;">${escapeHtml(e.date)}</p>
            <p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#1A1A1A;line-height:1.3;">${escapeHtml(e.name)}</p>
            ${e.time ? `<p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#444;"><strong>Time:</strong> ${escapeHtml(e.time)}</p>` : ''}
            ${e.location ? `<p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#444;"><strong>Location:</strong> ${escapeHtml(e.location)}</p>` : ''}
            <a href="${escapeHtml(e.url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#C6A664;text-decoration:none;font-weight:600;">RSVP &#8594;</a>
          </td></tr>
        </table>`).join('');

      return heading + cards;
    }

    case 'signoff': {
      const name = escapeHtml(c.name || ctx.senderName);
      const title = escapeHtml(c.title || '');
      const ps = c.ps ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#666;margin-top:12px;font-style:italic;">P.S. ${escapeHtml(c.ps)}</p>` : '';
      return `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#444;margin:32px 0 4px;">${name}</p>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#888;margin:0;">${title}</p>
              ${ps}`;
    }

    case 'footer':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #EAEAE5;">
        <tr><td align="center" style="padding:24px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#888;">
          ${escapeHtml(c.org || '704 Collective, Charlotte, NC')}
        </td></tr>
        <tr><td align="center" style="padding:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#888;">
          <a href="{{unsubscribe_url}}" style="color:#888;text-decoration:underline;">Unsubscribe</a> &middot; <a href="${ctx.siteUrl}/settings" style="color:#888;text-decoration:underline;">Manage preferences</a>
        </td></tr>
      </table>`;

    default:
      return '';
  }
}

function renderBlocks(blocks: Block[] | null | undefined, ctx: RenderContext): string {
  if (!blocks || !Array.isArray(blocks)) return '';
  const inner = blocks.map(b => renderBlock(b, ctx)).join('\n');
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    @media only screen and (max-width: 600px) {
      .email-card {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 0 !important;
      }
      .email-card-padding {
        padding: 16px 20px !important;
      }
      .email-outer-padding {
        padding: 0 !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;">
    <tr><td align="center" class="email-outer-padding" style="padding:32px 16px;">
      <table role="presentation" class="email-card" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <tr><td class="email-card-padding" style="padding:8px 40px 40px;">
          ${inner}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ===== End renderer =====

/** Call the centralised send-email render endpoint to get subject + HTML.
 *  For campaigns the "campaign-broadcast" template is a passthrough that
 *  returns bodyHtml unchanged — the benefit is that all email sends are
 *  routed through the same central function for future extensibility. */
async function renderCampaignTemplate(
  supabaseUrl: string,
  serviceKey: string,
  subject: string,
  bodyHtml: string,
  previewText?: string,
): Promise<{ subject: string; html: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      mode: 'render',
      template: 'campaign-broadcast',
      data: { subject, bodyHtml, previewText: previewText || '' },
    }),
  });
  if (!res.ok) throw new Error(`Failed to render campaign-broadcast template: ${await res.text()}`);
  return res.json() as Promise<{ success: true; subject: string; html: string }>;
}

// Normalize frontend value aliases to canonical names.
const AUDIENCE_ALIAS: Record<string, string> = {
  all_active:       "all_members",
  social:           "social_members",
  business:         "business_members",
  all_members:      "all_members",
  social_members:   "social_members",
  business_members: "business_members",
};

interface ResolveOpts {
  createdBy?: string | null;
  audienceEventId?: string | null;
  audienceSegmentIds?: string[] | null;
}

/**
 * Lowercased emails that have opted out of marketing on either side of the
 * identity split: profiles.marketing_unsubscribed or contacts.unsubscribed.
 * Same union event_non_members builds inline, hoisted so the member audiences
 * can honor it on both their halves.
 *
 * Explicit limits on both reads. PostgREST caps at 1000 rows by default, and a
 * truncated exclusion set fails silently in the worst direction - it mails
 * people who asked us not to. Read failures are returned as errors rather than
 * swallowed, so a resolve aborts instead of sending to an unfiltered list.
 */
async function loadOptedOutEmails(
  supabase: ReturnType<typeof createClient>,
): Promise<{ optedOut: Set<string>; error?: string }> {
  const optedOut = new Set<string>();

  const { data: unsubProfiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("email")
    .eq("marketing_unsubscribed", true)
    .limit(100000);
  if (profilesErr) {
    return { optedOut, error: `opt-out lookup failed (profiles): ${profilesErr.message}` };
  }
  for (const p of (unsubProfiles ?? []) as any[]) {
    if (p.email) optedOut.add(String(p.email).toLowerCase());
  }

  const { data: unsubContacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("email")
    .eq("unsubscribed", true)
    .limit(100000);
  if (contactsErr) {
    return { optedOut, error: `opt-out lookup failed (contacts): ${contactsErr.message}` };
  }
  for (const c of (unsubContacts ?? []) as any[]) {
    if (c.email) optedOut.add(String(c.email).toLowerCase());
  }

  return { optedOut };
}

/**
 * Resolve an audience type to a list of recipients. Shared by the normal
 * campaign send path and the count-only preview mode so counts never drift
 * from real sends. Returns { error } for audiences that need extra params
 * (self needs createdBy; event_* need an event id); the caller decides how
 * to surface that.
 */
async function resolveAudience(
  supabase: ReturnType<typeof createClient>,
  rawAudienceType: string,
  opts: ResolveOpts,
): Promise<{ recipients: Recipient[]; error?: string }> {
  const audienceType = AUDIENCE_ALIAS[rawAudienceType] ?? rawAudienceType;
  let recipients: Recipient[] = [];

  if (audienceType === "self") {
    if (!opts.createdBy) {
      return { recipients: [], error: "Cannot resolve sender - campaign has no created_by" };
    }
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", opts.createdBy)
      .single();
    if (senderProfile?.email) {
      recipients = [{ email: senderProfile.email, name: senderProfile.full_name, profile_id: senderProfile.id }];
    }
  } else if (audienceType === "super_admins") {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "super_admin")
      .is("deleted_at", null);
    recipients = (profiles ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({ email: p.email, name: p.full_name, profile_id: p.id }));
  } else if (audienceType === "all_members") {
    const { optedOut, error: optOutErr } = await loadOptedOutEmails(supabase);
    if (optOutErr) return { recipients: [], error: optOutErr };
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("member_type", ["social", "business"])
      .in("subscription_status", ["active", "trialing"])
      .is("deleted_at", null)
      .or("marketing_unsubscribed.is.null,marketing_unsubscribed.eq.false")
      .limit(100000);
    recipients = (profiles ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({ email: p.email, name: p.full_name, profile_id: p.id }));
    const { data: pplAll } = await supabase
      .from("people")
      .select("id, email, full_name, metadata")
      .in("member_tier", ["social", "business"])
      .eq("member_status", "active")
      .limit(100000);
    for (const pr of (pplAll ?? []) as any[]) {
      if (!pr.email) continue;
      recipients.push({ email: pr.email, name: pr.full_name, profile_id: pr.metadata?.profile_id ?? undefined });
    }
    // Both halves, one gate. The profiles query only knows its own flag, and the
    // people half knew about no flag at all - so an opted-out member arrived
    // through the people row even when the profiles row correctly excluded them.
    recipients = recipients.filter((r) => !!r.email && !optedOut.has(r.email.toLowerCase()));
  } else if (audienceType === "social_members") {
    const { optedOut, error: optOutErr } = await loadOptedOutEmails(supabase);
    if (optOutErr) return { recipients: [], error: optOutErr };
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("member_type", "social")
      .in("subscription_status", ["active", "trialing"])
      .is("deleted_at", null)
      .or("marketing_unsubscribed.is.null,marketing_unsubscribed.eq.false")
      .limit(100000);
    recipients = (profiles ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({ email: p.email, name: p.full_name, profile_id: p.id }));
    const { data: pplSocial } = await supabase
      .from("people")
      .select("id, email, full_name, metadata")
      .eq("member_tier", "social")
      .eq("member_status", "active")
      .limit(100000);
    for (const pr of (pplSocial ?? []) as any[]) {
      if (!pr.email) continue;
      recipients.push({ email: pr.email, name: pr.full_name, profile_id: pr.metadata?.profile_id ?? undefined });
    }
    recipients = recipients.filter((r) => !!r.email && !optedOut.has(r.email.toLowerCase()));
  } else if (audienceType === "business_members") {
    const { optedOut, error: optOutErr } = await loadOptedOutEmails(supabase);
    if (optOutErr) return { recipients: [], error: optOutErr };
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("member_type", "business")
      .in("subscription_status", ["active", "trialing"])
      .is("deleted_at", null)
      .or("marketing_unsubscribed.is.null,marketing_unsubscribed.eq.false")
      .limit(100000);
    recipients = (profiles ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({ email: p.email, name: p.full_name, profile_id: p.id }));
    const { data: pplBusiness } = await supabase
      .from("people")
      .select("id, email, full_name, metadata")
      .eq("member_tier", "business")
      .eq("member_status", "active")
      .limit(100000);
    for (const pr of (pplBusiness ?? []) as any[]) {
      if (!pr.email) continue;
      recipients.push({ email: pr.email, name: pr.full_name, profile_id: pr.metadata?.profile_id ?? undefined });
    }
    recipients = recipients.filter((r) => !!r.email && !optedOut.has(r.email.toLowerCase()));
  } else if (audienceType === "non_member") {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("member_type", ["social_non_member", "business_non_member"])
      .is("deleted_at", null)
      .or("marketing_unsubscribed.is.null,marketing_unsubscribed.eq.false");
    recipients = (profiles ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({ email: p.email, name: p.full_name, profile_id: p.id }));
  } else if (audienceType === "cancelled") {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("subscription_status", ["canceled", "cancel_at_period_end"])
      .is("deleted_at", null)
      .or("marketing_unsubscribed.is.null,marketing_unsubscribed.eq.false");
    recipients = (profiles ?? [])
      .filter((p) => !!p.email)
      .map((p) => ({ email: p.email, name: p.full_name, profile_id: p.id }));
  } else if (audienceType === "event_guests") {
    const eventId = opts.audienceEventId ?? null;
    if (!eventId) {
      return { recipients: [], error: "event_guests audience requires an event_id" };
    }
    const { data: participants } = await supabase
      .from("event_participants_view")
      .select("email, full_name, guest_name")
      .eq("event_id", eventId)
      .neq("status", "cancelled");
    const seen = new Set<string>();
    for (const p of participants ?? []) {
      if (!p.email || seen.has(p.email.toLowerCase())) continue;
      seen.add(p.email.toLowerCase());
      recipients.push({ email: p.email, name: p.full_name || p.guest_name || "Guest" });
    }
  } else if (audienceType === "event_non_members") {
    const eventId = opts.audienceEventId ?? null;
    if (!eventId) {
      return { recipients: [], error: "event_non_members audience requires an event_id" };
    }

    const candidates: Recipient[] = [];

    // 1) attendance_credentials (active/used) → people bridge via person_id
    const { data: creds } = await supabase
      .from("attendance_credentials")
      .select("person_id, status")
      .eq("event_id", eventId)
      .in("status", ["active", "used"]);
    const personIds = [...new Set((creds ?? []).map((c: any) => c.person_id).filter(Boolean))];
    if (personIds.length > 0) {
      const { data: ppl } = await supabase
        .from("people")
        .select("id, email, full_name")
        .in("id", personIds);
      for (const p of (ppl ?? []) as any[]) {
        if (p.email) candidates.push({ email: p.email, name: p.full_name ?? null });
      }
    }

    // 2) tickets (confirmed/rsvp) → profiles.email ?? guest_email
    const { data: tks } = await supabase
      .from("tickets")
      .select("user_id, guest_email, guest_name, status")
      .eq("event_id", eventId)
      .in("status", ["confirmed", "rsvp"]);
    const ticketUserIds = [...new Set((tks ?? []).map((t: any) => t.user_id).filter(Boolean))];
    const profMap = new Map<string, { email: string | null; full_name: string | null }>();
    if (ticketUserIds.length > 0) {
      const { data: tprofs } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ticketUserIds);
      for (const p of (tprofs ?? []) as any[]) profMap.set(p.id, { email: p.email, full_name: p.full_name });
    }
    for (const t of (tks ?? []) as any[]) {
      const prof = t.user_id ? profMap.get(t.user_id) : null;
      const email = prof?.email ?? t.guest_email;
      const name = prof?.full_name ?? t.guest_name ?? null;
      if (email) candidates.push({ email, name });
    }

    // 3) event_public_rsvps (not cancelled)
    const { data: rsvps } = await supabase
      .from("event_public_rsvps")
      .select("email, first_name, last_name, status")
      .eq("event_id", eventId)
      .neq("status", "cancelled");
    for (const r of (rsvps ?? []) as any[]) {
      if (r.email) candidates.push({ email: r.email, name: [r.first_name, r.last_name].filter(Boolean).join(" ") || null });
    }

    // Dedupe candidates by lower(email)
    const byEmail = new Map<string, Recipient>();
    for (const c of candidates) {
      if (!c.email) continue;
      const k = c.email.toLowerCase();
      if (!byEmail.has(k)) byEmail.set(k, c);
    }

    // EXCLUDE current members (active/trialing or membership_override), not deleted
    const memberEmails = new Set<string>();
    const { data: members } = await supabase
      .from("profiles")
      .select("email, subscription_status, membership_override, deleted_at")
      .is("deleted_at", null)
      .or("subscription_status.in.(active,trialing),membership_override.eq.true");
    for (const m of (members ?? []) as any[]) {
      if (m.email) memberEmails.add(m.email.toLowerCase());
    }

    // EXCLUDE unsubscribed (profiles.marketing_unsubscribed OR contacts.unsubscribed)
    const unsubEmails = new Set<string>();
    const { data: unsubProfiles } = await supabase
      .from("profiles")
      .select("email")
      .eq("marketing_unsubscribed", true);
    for (const p of (unsubProfiles ?? []) as any[]) {
      if (p.email) unsubEmails.add(p.email.toLowerCase());
    }
    const { data: unsubContacts } = await supabase
      .from("contacts")
      .select("email")
      .eq("unsubscribed", true);
    for (const c of (unsubContacts ?? []) as any[]) {
      if (c.email) unsubEmails.add(c.email.toLowerCase());
    }

    recipients = Array.from(byEmail.entries())
      .filter(([k]) => !memberEmails.has(k) && !unsubEmails.has(k))
      .map(([, v]) => v);
  } else if (audienceType === "all_contacts") {
    // contacts has full_name only - it has never had first_name / last_name.
    // Selecting those columns made PostgREST return 400, and because the error
    // was discarded this audience silently resolved to zero recipients.
    const { optedOut, error: optOutErr } = await loadOptedOutEmails(supabase);
    if (optOutErr) return { recipients: [], error: optOutErr };
    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, email, full_name")
      .or("unsubscribed.is.null,unsubscribed.eq.false")
      .limit(100000);
    if (contactsErr) {
      return { recipients: [], error: `all_contacts query failed: ${contactsErr.message}` };
    }

    // Exclude anyone who is already a paying or comped member. Roughly 22 percent
    // of the contacts table overlaps active members, and this audience is used for
    // prospect-facing copy - pitching membership to people who already pay reads
    // as though we do not know our own members.
    // Explicit high limit. PostgREST defaults to 1000 rows, and a truncated
    // exclusion set would silently let members back into the audience - the same
    // no-error, quietly-wrong failure shape as the first_name bug above.
    const { data: memberEmails, error: memberErr } = await supabase
      .from("profiles")
      .select("email, subscription_status, membership_override, deleted_at")
      .is("deleted_at", null)
      .limit(100000);
    if (memberErr) {
      return { recipients: [], error: `all_contacts member lookup failed: ${memberErr.message}` };
    }
    const activeMemberEmails = new Set(
      (memberEmails ?? [])
        .filter((p) =>
          p.email &&
          (p.subscription_status === "active" ||
            p.subscription_status === "trialing" ||
            p.membership_override === true))
        .map((p) => String(p.email).toLowerCase()),
    );

    // The contacts query above only honors contacts.unsubscribed. Someone who
    // opted out while signed in has the flag on their profile instead, so the
    // union set is what actually keeps them out of a prospect blast.
    recipients = (contacts ?? [])
      .filter((c) => {
        if (!c.email) return false;
        const key = String(c.email).toLowerCase();
        return !activeMemberEmails.has(key) && !optedOut.has(key);
      })
      .map((c) => ({
        email: c.email,
        name: c.full_name || null,
        contact_id: c.id,
      }));
  } else if (audienceType === "segment" && opts.audienceSegmentIds?.length) {
    // Same column mismatch as all_contacts above - the embed resolved to
    // contacts_1.first_name, which does not exist, so every tagged segment
    // silently produced an empty audience.
    const { data: taggedContacts, error: taggedErr } = await supabase
      .from("contact_tags")
      .select("contact_id, contacts(id, email, full_name)")
      .in("tag", opts.audienceSegmentIds);
    if (taggedErr) {
      return { recipients: [], error: `segment query failed: ${taggedErr.message}` };
    }
    const seen = new Set<string>();
    for (const row of taggedContacts ?? []) {
      const c = row.contacts as { id: string; email: string; full_name: string | null } | null;
      if (c && c.email && !seen.has(c.id)) {
        seen.add(c.id);
        recipients.push({
          email: c.email,
          name: c.full_name || null,
          contact_id: c.id,
        });
      }
    }
  }

  return { recipients };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authorization: admin or super_admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authedUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authedUser?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: authedProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authedUser.id)
      .maybeSingle();
    if (!authedProfile || !["admin", "super_admin"].includes(authedProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";

    const body = (await req.json().catch(() => ({}))) as SendCampaignPayload;
    const { campaign_id, test_email, count_only } = body;

    // ── COUNT-ONLY MODE: resolve an audience and return its size. No writes. ──
    if (count_only) {
      const { recipients, error: resolveError } = await resolveAudience(
        supabase,
        body.audience_type ?? "all_members",
        { createdBy: authedUser.id, audienceEventId: body.audience_event_id ?? null, audienceSegmentIds: null },
      );
      if (resolveError) {
        return new Response(JSON.stringify({ count: 0, error: resolveError }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const uniq = new Set(recipients.filter((r) => r.email).map((r) => r.email.toLowerCase()));
      return new Response(JSON.stringify({ count: uniq.size }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load campaign
    const { data: campaign, error: campaignErr } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((campaign.status === "sent" || campaign.status === "sending") && !test_email) {
      return new Response(JSON.stringify({ error: `Campaign already ${campaign.status}` }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject: string = campaign.subject;
    const fromName: string = campaign.from_name ?? "704 Collective";
    const fromEmail: string = campaign.from_email ?? "no-reply@704collective.com";

    // Load the actual sender's full name for {{sender_name}} token resolution
    let senderFullName: string | null = null;
    if (campaign.created_by) {
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", campaign.created_by)
        .single();
      senderFullName = senderProfile?.full_name ?? null;
    }
    const senderDisplayName = senderFullName || fromName;
    const unsubscribeBase = `${SITE_URL}/unsubscribe`;

    // ── TEST SEND: single recipient, no DB updates ───────────────────────────
    if (test_email) {
      const trackingPixel = `<img src="${SITE_URL}/api/track/open?c=${campaign_id}&e=${encodeURIComponent(test_email)}" width="1" height="1" style="display:none" />`;
      const renderedBlocks = renderBlocks(campaign.body_json as Block[], {
        isTest: true,
        senderName: senderDisplayName,
        siteUrl: SITE_URL,
      });
      const { html: centralHtml } = await renderCampaignTemplate(
        supabaseUrl, serviceRoleKey,
        subject, renderedBlocks, campaign.preview_text || '',
      );
      const finalHtml = centralHtml
        .replace(/{{first_name}}/gi, 'Preview')
        .replace(/{{name}}/gi, 'Preview')
        .replace(/{{sender_name}}/gi, senderDisplayName)
        .replace(/{{unsubscribe_url}}/gi, `${SITE_URL}/unsubscribe?preview=1`)
        + trackingPixel;

      const testRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: test_email,
          subject: `[TEST] ${subject}`,
          html: finalHtml,
        }),
      });

      if (!testRes.ok) {
        const errData = await testRes.json().catch(() => ({}));
        console.error("send-campaign test send failed:", errData);
        return new Response(JSON.stringify({ error: errData.message ?? "Failed to send test email" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, sent_to: test_email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ── END TEST SEND ────────────────────────────────────────────────────────

    // Mark as sending
    await supabase
      .from("email_campaigns")
      .update({ status: "sending" })
      .eq("id", campaign_id);

    // Resolve recipients for this campaign's audience (shared resolver).
    let recipients: Recipient[] = [];
    {
      const { recipients: resolved, error: resolveError } = await resolveAudience(
        supabase,
        campaign.audience_type ?? "all_members",
        {
          createdBy: campaign.created_by ?? null,
          audienceEventId: campaign.audience_event_id ?? null,
          audienceSegmentIds: campaign.audience_segment_ids ?? null,
        },
      );
      if (resolveError) {
        console.error(`[send-campaign] audience resolve error: ${resolveError}`);
        await supabase.from("email_campaigns").update({ status: "draft" }).eq("id", campaign_id);
        return new Response(JSON.stringify({ error: resolveError }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients = resolved;
    }

    if (recipients.length === 0) {
      await supabase
        .from("email_campaigns")
        .update({ status: "draft" })
        .eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "No recipients found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by email
    const uniqueMap = new Map<string, Recipient>();
    for (const r of recipients) {
      if (r.email && !uniqueMap.has(r.email.toLowerCase())) {
        uniqueMap.set(r.email.toLowerCase(), r);
      }
    }
    const finalRecipients = Array.from(uniqueMap.values());

    // Fetch upcoming events for any events_list blocks
    const campaignBlocks = (campaign.body_json as Block[]) ?? [];
    const eventsListBlocks = campaignBlocks.filter(b => b.type === 'events_list');
    const maxDaysAhead = eventsListBlocks.length > 0
      ? Math.max(...eventsListBlocks.map(b => {
          const v = Number(b.content?.days_ahead);
          return v > 0 ? v : 7;
        }))
      : 0;

    let upcomingEvents: Array<{ name: string; date: string; location: string; url: string }> = [];
    if (maxDaysAhead > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + maxDaysAhead);
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, location_name')
        .gte('start_time', new Date().toISOString())
        .lte('start_time', cutoff.toISOString())
        .eq('is_published', true)
        .order('start_time', { ascending: true })
        .limit(10);
      if (eventsError) {
        console.error('[send-campaign] events query failed:', eventsError);
      }
      upcomingEvents = (eventsData ?? []).map(e => {
        const startDate = new Date(e.start_time);
        const endDate = e.end_time ? new Date(e.end_time) : null;
        const timeStr = endDate
          ? `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}`
          : startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
        return {
          name: e.title,
          date: startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }),
          time: timeStr,
          location: e.location_name || '',
          url: `${SITE_URL}/events/${e.id}`,
        };
      });
    }

    // Render blocks once, then route through centralised template for future-proof delivery
    const renderedBlocks = renderBlocks(campaignBlocks, {
      isTest: false,
      upcomingEvents,
      senderName: senderDisplayName,
      siteUrl: SITE_URL,
    });

    const { html: centralHtml } = await renderCampaignTemplate(
      supabaseUrl, serviceRoleKey,
      subject, renderedBlocks, campaign.preview_text || '',
    );

    // Batch send (Resend batch endpoint, max 100 per call)
    const BATCH_SIZE = 100;
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < finalRecipients.length; i += BATCH_SIZE) {
      const batch = finalRecipients.slice(i, i + BATCH_SIZE);

      const emails = batch.map((r) => {
        const unsubToken = btoa(`${r.email}:${campaign_id}`);
        const unsubUrl = `${unsubscribeBase}?token=${unsubToken}`;
        const trackingPixel = `<img src="${SITE_URL}/api/track/open?c=${campaign_id}&e=${encodeURIComponent(r.email)}" width="1" height="1" style="display:none" />`;
        const body = centralHtml
          .replace(/{{first_name}}/gi, r.name?.split(" ")[0] ?? "Member")
          .replace(/{{name}}/gi, r.name ?? "Member")
          .replace(/{{sender_name}}/gi, senderDisplayName)
          .replace(/{{unsubscribe_url}}/gi, unsubUrl);
        const finalHtml = `${body}${trackingPixel}`;

        return {
          from: `${fromName} <${fromEmail}>`,
          to: r.name ? `${r.name} <${r.email}>` : r.email,
          subject,
          html: finalHtml,
        };
      });

      const batchRes = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emails),
      });

      const batchData = await batchRes.json();

      // Log each email
      const logRows = batch.map((r, idx) => {
        const resendId = batchData?.data?.[idx]?.id ?? null;
        const success = batchRes.ok && resendId;
        if (success) totalSent++; else totalFailed++;
        return {
          campaign_id,
          profile_id: r.profile_id ?? null,
          to_email: r.email,
          to_name: r.name ?? null,
          from_email: fromEmail,
          subject,
          resend_id: resendId,
          resend_message_id: resendId,
          status: success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        };
      });

      const { error: logError } = await supabase.from("email_log").insert(logRows);
      if (logError) {
        console.error("[send-campaign] email_log insert failed:", logError);
      }
    }

    const finalStatus = (totalSent === 0 && finalRecipients.length > 0)
      ? "failed"
      : "sent";

    const { error: campaignUpdateError } = await supabase
      .from("email_campaigns")
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        recipient_count: finalRecipients.length,
        sent_count: totalSent,
        delivered_count: totalSent,
      })
      .eq("id", campaign_id);

    if (campaignUpdateError) {
      console.error("[send-campaign] campaign update failed:", campaignUpdateError);
    }

    return new Response(
      JSON.stringify({
        success: finalStatus !== "failed",
        status: finalStatus,
        sent: totalSent,
        failed: totalFailed,
        total: finalRecipients.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-campaign error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
