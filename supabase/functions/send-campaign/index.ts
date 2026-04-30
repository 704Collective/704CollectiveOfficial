import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendCampaignPayload {
  campaign_id: string;
  test_email?: string; // when provided, send only to this address (no DB updates)
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
        const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
            <a href="${escapeHtml(e.url)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#C6A664;text-decoration:none;font-weight:600;">RSVP →</a>
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
          <a href="{{unsubscribe_url}}" style="color:#888;text-decoration:underline;">Unsubscribe</a> · <a href="${ctx.siteUrl}/settings" style="color:#888;text-decoration:underline;">Manage preferences</a>
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
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F0;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <tr><td style="padding:8px 40px 40px;">
          ${inner}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ===== End renderer =====

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";

    const { campaign_id, test_email }: SendCampaignPayload = await req.json();
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

    if (campaign.status === "sent" && !test_email) {
      return new Response(JSON.stringify({ error: "Campaign already sent" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject: string = campaign.subject;
    const fromName: string = campaign.from_name ?? "704 Collective";
    const fromEmail: string = campaign.from_email ?? "no-reply@704collective.com";
    const unsubscribeBase = `${SITE_URL}/unsubscribe`;

    // ── TEST SEND: single recipient, no DB updates ───────────────────────────
    if (test_email) {
      const trackingPixel = `<img src="${SITE_URL}/api/track/open?c=${campaign_id}&e=${encodeURIComponent(test_email)}" width="1" height="1" style="display:none" />`;
      const renderedHtml = renderBlocks(campaign.body_json as Block[], {
        isTest: true,
        senderName: fromName,
        siteUrl: SITE_URL,
      });
      const finalHtml = renderedHtml
        .replace(/{{first_name}}/gi, 'Preview')
        .replace(/{{name}}/gi, 'Preview')
        .replace(/{{sender_name}}/gi, fromName)
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

    // Build recipient list based on audience_type
    let recipients: Recipient[] = [];
    const audienceType: string = campaign.audience_type ?? "all_members";

    if (audienceType === "self") {
      if (!campaign.created_by) {
        await supabase.from("email_campaigns").update({ status: "draft" }).eq("id", campaign_id);
        return new Response(JSON.stringify({ error: "Cannot resolve sender — campaign has no created_by" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", campaign.created_by)
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
      recipients = (profiles ?? []).map((p) => ({
        email: p.email,
        name: p.full_name,
        profile_id: p.id,
      }));
    } else if (audienceType === "all_members") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("subscription_status", ["active", "trialing"])
        .is("deleted_at", null);
      recipients = (profiles ?? []).map((p) => ({
        email: p.email,
        name: p.full_name,
        profile_id: p.id,
      }));
    } else if (audienceType === "social_members") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("member_type", "social")
        .in("subscription_status", ["active", "trialing"])
        .is("deleted_at", null);
      recipients = (profiles ?? []).map((p) => ({
        email: p.email,
        name: p.full_name,
        profile_id: p.id,
      }));
    } else if (audienceType === "business_members") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("member_type", "business")
        .in("subscription_status", ["active", "trialing"])
        .is("deleted_at", null);
      recipients = (profiles ?? []).map((p) => ({
        email: p.email,
        name: p.full_name,
        profile_id: p.id,
      }));
    } else if (audienceType === "all_contacts") {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name")
        .eq("unsubscribed", false);
      recipients = (contacts ?? []).map((c) => ({
        email: c.email,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
        contact_id: c.id,
      }));
    } else if (audienceType === "segment" && campaign.audience_segment_ids?.length) {
      // contacts with specific tags
      const { data: taggedContacts } = await supabase
        .from("contact_tags")
        .select("contact_id, contacts(id, email, first_name, last_name)")
        .in("tag", campaign.audience_segment_ids);
      const seen = new Set<string>();
      for (const row of taggedContacts ?? []) {
        const c = row.contacts as { id: string; email: string; first_name: string; last_name: string } | null;
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          recipients.push({
            email: c.email,
            name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
            contact_id: c.id,
          });
        }
      }
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
      ? Math.max(...eventsListBlocks.map(b => Number(b.content?.days_ahead) || 7))
      : 0;

    let upcomingEvents: Array<{ name: string; date: string; location: string; url: string }> = [];
    if (maxDaysAhead > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + maxDaysAhead);
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, title, start_time, end_time, location')
        .gte('start_time', new Date().toISOString())
        .lte('start_time', cutoff.toISOString())
        .eq('is_published', true)
        .order('start_time', { ascending: true })
        .limit(10);
      upcomingEvents = (eventsData ?? []).map(e => {
        const startDate = new Date(e.start_time);
        const endDate = e.end_time ? new Date(e.end_time) : null;
        const timeStr = endDate
          ? `${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
          : startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return {
          name: e.title,
          date: startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          time: timeStr,
          location: e.location || '',
          url: `${SITE_URL}/events/${e.id}`,
        };
      });
    }

    // Render HTML once — shared across all recipients (per-recipient tokens are replaced inside the loop)
    const renderedHtml = renderBlocks(campaignBlocks, {
      isTest: false,
      upcomingEvents,
      senderName: fromName,
      siteUrl: SITE_URL,
    });

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
        const body = renderedHtml
          .replace(/{{first_name}}/gi, r.name?.split(" ")[0] ?? "Member")
          .replace(/{{name}}/gi, r.name ?? "Member")
          .replace(/{{sender_name}}/gi, fromName)
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
          contact_id: r.contact_id ?? null,
          profile_id: r.profile_id ?? null,
          email: r.email,
          subject,
          resend_message_id: resendId,
          status: success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        };
      });

      await supabase.from("email_log").insert(logRows);
    }

    // Update campaign status
    await supabase
      .from("email_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: finalRecipients.length,
      })
      .eq("id", campaign_id);

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: totalFailed, total: finalRecipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-campaign error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});