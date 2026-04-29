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

    const htmlBody: string = campaign.body_html ?? campaign.content_html ?? campaign.content ?? "";
    const subject: string = campaign.subject;
    const fromName: string = campaign.from_name ?? "704 Collective";
    const fromEmail: string = campaign.from_email ?? "no-reply@704collective.com";
    const unsubscribeBase = `${SITE_URL}/unsubscribe`;

    // ── TEST SEND: single recipient, no DB updates ───────────────────────────
    if (test_email) {
      const unsubToken = btoa(`${test_email}:${campaign_id}`);
      const unsubUrl = `${unsubscribeBase}?token=${unsubToken}`;
      const trackingPixel = `<img src="${SITE_URL}/api/track/open?c=${campaign_id}&e=${encodeURIComponent(test_email)}" width="1" height="1" style="display:none" />`;
      const body = htmlBody
        .replace(/{{first_name}}/gi, "Preview")
        .replace(/{{name}}/gi, "Preview")
        .replace(/{{sender_name}}/gi, fromName)
        .replace(/{{unsubscribe_url}}/gi, unsubUrl);
      const finalHtml = `${body}${trackingPixel}
<p style="font-size:11px;color:#999;margin-top:32px;">
  <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
</p>`;

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

    if (audienceType === "all_members") {
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
        const body = htmlBody
          .replace(/{{first_name}}/gi, r.name?.split(" ")[0] ?? "Member")
          .replace(/{{name}}/gi, r.name ?? "Member")
          .replace(/{{unsubscribe_url}}/gi, unsubUrl);
        const finalHtml = `${body}${trackingPixel}
<p style="font-size:11px;color:#999;margin-top:32px;">
  <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>
</p>`;

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