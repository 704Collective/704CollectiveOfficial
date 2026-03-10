import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GUEST-FOLLOWUP] ${step}${d}`);
};

// ── Brand constants (mirrored from send-email) ──
const BRAND = {
  color: "#1A1A1A",
  surface: "#2E2E2E",
  accent: "#D4A853",
  accentText: "#1A1A1A",
  text: "#FAF6F0",
  textSecondary: "#D8D8D8",
  textMuted: "#A0A0A0",
  border: "rgba(255,255,255,0.10)",
  logoUrl: "https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets/704-logo.png",
  fontStack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function baseLayout(content: string, origin?: string): string {
  const homeUrl = origin || "#";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.color};font-family:${BRAND.fontStack};color:${BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.color};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.surface};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
<tr><td align="center" style="padding:32px 40px 24px;border-bottom:1px solid ${BRAND.border};">
<a href="${homeUrl}" target="_blank" style="text-decoration:none;border:none;">
<img src="${BRAND.logoUrl}" alt="704 Collective" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
</a>
</td></tr>
<tr><td style="padding:32px 40px;">
${content}
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid ${BRAND.border};">
<p style="margin:0;font-size:13px;color:${BRAND.textMuted};text-align:center;">704 Collective &middot; Charlotte, NC</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
<tr><td align="center" style="background-color:${BRAND.accent};border-radius:8px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">${text}</a>
</td></tr>
</table>`;
}

const MEMBERSHIP_URL = "https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04";

function buildGuestFollowupEmail(data: { guestName: string; memberName: string; eventName: string; origin?: string }): { subject: string; html: string } {
  const guestName = data.guestName || "there";
  const base = data.origin || "#";
  return {
    subject: `Thanks for joining us at ${data.eventName}!`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for coming to <strong>${data.eventName}</strong> with us! We hope you had a great time.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">You were invited by <strong>${data.memberName}</strong> — shout out to them for bringing you along.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Loved it? Join 704 Collective and get free access to all our events, plus a community of young professionals in Charlotte.</p>
${ctaButton("Become a Member", MEMBERSHIP_URL)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
`, base),
  };
}

function buildTicketFollowupEmail(data: { guestName: string; eventName: string; origin?: string }): { subject: string; html: string } {
  const guestName = data.guestName || "there";
  const base = data.origin || "#";
  return {
    subject: `Thanks for joining us at ${data.eventName}!`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${guestName}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Thanks for coming to <strong>${data.eventName}</strong>! We hope you had an amazing time.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Want to skip the ticket line next time? Members get <strong>free access to all events</strong>, plus you'll be part of Charlotte's best community for young professionals.</p>
${ctaButton("Become a Member", MEMBERSHIP_URL)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Questions? Contact <a href="mailto:hello@704collective.com" style="color:${BRAND.accent};">hello@704collective.com</a></p>
`, base),
  };
}

// ── Resend batch helper ──
async function sendResendBatch(
  resendKey: string,
  emails: { from: string; to: string[]; subject: string; html: string }[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify(chunk),
      });

      if (res.ok) {
        const data = await res.json();
        sent += Array.isArray(data.data) ? data.data.length : chunk.length;
        log(`Batch ${Math.floor(i / 100) + 1} sent`, { count: chunk.length });
      } else {
        const errBody = await res.text();
        log(`Batch ${Math.floor(i / 100) + 1} failed`, { status: res.status, body: errBody });
        failed += chunk.length;
      }
    } catch (err) {
      log(`Batch ${Math.floor(i / 100) + 1} error`, { error: String(err) });
      failed += chunk.length;
    }

    if (i + 100 < emails.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { sent, failed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Admin auth check ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Allow service role (for cron/internal calls) or admin JWT
    if (token !== serviceRoleKey) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
      const { data: roleData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", claimsData.claims.sub)
        .eq("role", "admin")
        .single();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse optional event_id from body
    let eventId: string | null = null;
    let origin: string | null = null;
    try {
      const body = await req.json();
      eventId = body.event_id || null;
      origin = body.origin || null;
    } catch {
      // No body or invalid JSON — that's fine for cron calls
    }

    log("Starting", { eventId, origin });

    // Build query for eligible guest passes
    let query = supabase
      .from("guest_passes")
      .select("id, guest_name, guest_email, event_id, member_id")
      .eq("status", "used")
      .is("followup_sent_at", null);

    if (eventId) {
      query = query.eq("event_id", eventId);
    } else {
      const now = new Date();
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      const { data: recentEvents } = await supabase
        .from("events")
        .select("id")
        .lte("end_time", oneHourAgo.toISOString())
        .gte("end_time", twentyFiveHoursAgo.toISOString());

      const recentEventIds = (recentEvents || []).map((e: { id: string }) => e.id);
      if (recentEventIds.length === 0) {
        log("No recently ended events found");
        return new Response(
          JSON.stringify({ sent: 0, failed: 0, message: "No recently ended events" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      query = query.in("event_id", recentEventIds);
    }

    const { data: passes, error: passError } = await query;
    if (passError) throw passError;

    // ── Also find paid guest tickets (user_id IS NULL) ──
    let ticketQuery = supabase
      .from("tickets")
      .select("id, guest_name, guest_email, event_id")
      .is("user_id", null)
      .eq("status", "confirmed")
      .is("followup_sent_at", null)
      .not("guest_email", "is", null);

    if (eventId) {
      ticketQuery = ticketQuery.eq("event_id", eventId);
    } else {
      const now = new Date();
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      const { data: recentEvents } = await supabase
        .from("events")
        .select("id")
        .lte("end_time", oneHourAgo.toISOString())
        .gte("end_time", twentyFiveHoursAgo.toISOString());

      const recentEventIds = (recentEvents || []).map((e: { id: string }) => e.id);
      if (recentEventIds.length > 0) {
        ticketQuery = ticketQuery.in("event_id", recentEventIds);
      } else {
        ticketQuery = ticketQuery.eq("event_id", "00000000-0000-0000-0000-000000000000");
      }
    }

    const { data: guestTickets, error: ticketError } = await ticketQuery;
    if (ticketError) throw ticketError;

    const allPasses = passes || [];
    const allTickets = guestTickets || [];

    if (allPasses.length === 0 && allTickets.length === 0) {
      log("No eligible guest passes or tickets found");
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "No follow-ups to send" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Found ${allPasses.length} guest passes, ${allTickets.length} guest tickets`);

    // Gather unique event IDs and member IDs
    const eventIds = [...new Set([
      ...allPasses.map((p: { event_id: string }) => p.event_id).filter(Boolean),
      ...allTickets.map((t: { event_id: string }) => t.event_id).filter(Boolean),
    ])];
    const memberIds = [...new Set(allPasses.map((p: { member_id: string }) => p.member_id))];

    // Batch fetch events and members
    const fetchPromises: Promise<any>[] = [
      supabase.from("events").select("id, title").in("id", eventIds),
    ];
    if (memberIds.length > 0) {
      fetchPromises.push(supabase.from("profiles").select("id, full_name").in("id", memberIds));
    }
    const results = await Promise.all(fetchPromises);

    const eventsMap: Record<string, string> = {};
    (results[0].data || []).forEach((e: { id: string; title: string }) => {
      eventsMap[e.id] = e.title;
    });

    const membersMap: Record<string, string> = {};
    if (memberIds.length > 0) {
      (results[1].data || []).forEach((m: { id: string; full_name: string | null }) => {
        membersMap[m.id] = m.full_name || "a member";
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const baseUrl = origin || "https://704collective.com";

    // ── Build batch emails for guest pass follow-ups ──
    const passEmails: { from: string; to: string[]; subject: string; html: string }[] = [];
    const passIdMap: Map<string, string> = new Map(); // email -> pass.id

    for (const pass of allPasses) {
      const eventName = eventsMap[pass.event_id] || "our event";
      const memberName = membersMap[pass.member_id] || "a member";
      const { subject, html } = buildGuestFollowupEmail({
        guestName: pass.guest_name,
        memberName,
        eventName,
        origin: baseUrl,
      });
      passEmails.push({ from: "704 Collective <hello@704collective.com>", to: [pass.guest_email], subject, html });
      passIdMap.set(pass.guest_email, pass.id);
    }

    // ── Build batch emails for ticket follow-ups ──
    const ticketEmails: { from: string; to: string[]; subject: string; html: string }[] = [];
    const ticketIdMap: Map<string, string> = new Map(); // email -> ticket.id

    for (const ticket of allTickets) {
      const eventName = eventsMap[ticket.event_id] || "our event";
      const { subject, html } = buildTicketFollowupEmail({
        guestName: ticket.guest_name || "there",
        eventName,
        origin: baseUrl,
      });
      ticketEmails.push({ from: "704 Collective <hello@704collective.com>", to: [ticket.guest_email], subject, html });
      ticketIdMap.set(ticket.guest_email, ticket.id);
    }

    // Send all via batch API
    const allEmails = [...passEmails, ...ticketEmails];
    const { sent, failed } = await sendResendBatch(resendKey, allEmails);

    // Mark followup_sent_at for successfully sent items
    // Since batch API is all-or-nothing per chunk, mark all if batch succeeded
    if (sent > 0) {
      const now = new Date().toISOString();

      if (allPasses.length > 0) {
        const passIds = allPasses.map((p: { id: string }) => p.id);
        await supabase
          .from("guest_passes")
          .update({ followup_sent_at: now })
          .in("id", passIds);
      }

      if (allTickets.length > 0) {
        const ticketIds = allTickets.map((t: { id: string }) => t.id);
        await supabase
          .from("tickets")
          .update({ followup_sent_at: now })
          .in("id", ticketIds);
      }
    }

    log("Complete", { sent, failed });

    return new Response(
      JSON.stringify({ sent, failed, total: allEmails.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GUEST-FOLLOWUP] Internal error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
