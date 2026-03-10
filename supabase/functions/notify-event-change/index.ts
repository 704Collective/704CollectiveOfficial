import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[NOTIFY-EVENT-CHANGE] ${step}${d}`);
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

function buildEventChangeHtml(data: {
  name: string; eventName: string;
  oldDate: string; oldTime: string; newDate: string; newTime: string;
  newLocation?: string; eventUrl: string; origin?: string;
}): { subject: string; html: string } {
  const name = data.name || "there";
  return {
    subject: `📅 Schedule Change: ${data.eventName}`,
    html: baseLayout(`
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:${BRAND.text};">Hey ${name}!</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Heads up — <strong>${data.eventName}</strong> has been rescheduled.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;background-color:${BRAND.color};border-radius:8px;border:1px solid ${BRAND.border};">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${BRAND.textMuted};">Updated Schedule</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textMuted};text-decoration:line-through;">📅&nbsp;&nbsp;${data.oldDate} at ${data.oldTime}</td></tr>
<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.accent};font-weight:600;">📅&nbsp;&nbsp;${data.newDate} at ${data.newTime}</td></tr>
${data.newLocation ? `<tr><td style="padding:4px 0;font-size:15px;color:${BRAND.textSecondary};">📍&nbsp;&nbsp;${data.newLocation}</td></tr>` : ""}
</table>
</td></tr>
</table>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};">Your RSVP is still confirmed — no action needed unless the new time doesn't work for you.</p>
${ctaButton("View Event Details", data.eventUrl)}
<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Can't make it anymore? You can cancel your RSVP on the event page.</p>
`, data.origin),
  };
}

// ── Resend batch helper ──
async function sendResendBatch(
  resendKey: string,
  emails: { from: string; to: string[]; subject: string; html: string }[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Chunk into groups of 100
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
        log(`Batch ${Math.floor(i / 100) + 1} sent successfully`, { count: chunk.length });
      } else {
        const errBody = await res.text();
        log(`Batch ${Math.floor(i / 100) + 1} failed`, { status: res.status, body: errBody });
        failed += chunk.length;
      }
    } catch (err) {
      log(`Batch ${Math.floor(i / 100) + 1} error`, { error: String(err) });
      failed += chunk.length;
    }

    // 500ms delay between batches
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
    // Auth: require admin
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = (claims as { sub?: string })?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleCheck } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { eventId, eventName, oldStartTime, oldEndTime, newStartTime, newEndTime, newLocation, origin } = await req.json();

    if (!eventId || !eventName || !oldStartTime || !newStartTime) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Processing event change notification", { eventId, eventName });

    // Get all confirmed ticket holders for this event
    const { data: tickets, error: ticketErr } = await adminClient
      .from("tickets")
      .select("user_id, guest_email, guest_name")
      .eq("event_id", eventId)
      .eq("status", "confirmed");

    if (ticketErr) {
      log("Error fetching tickets", ticketErr);
      throw ticketErr;
    }

    if (!tickets || tickets.length === 0) {
      log("No ticket holders to notify");
      return new Response(JSON.stringify({ sent: 0, failed: 0, total: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile info for member ticket holders
    const memberUserIds = tickets.filter(t => t.user_id).map(t => t.user_id!);
    let profileMap: Record<string, { full_name: string | null; email: string }> = {};

    if (memberUserIds.length > 0) {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberUserIds)
        .is("deleted_at", null);

      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = { full_name: p.full_name, email: p.email };
        }
      }
    }

    // Format dates for the email
    const formatDate = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    };
    const formatTime = (iso: string) => {
      const d = new Date(iso);
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    };

    const oldDate = formatDate(oldStartTime);
    const oldTime = formatTime(oldStartTime);
    const newDate = formatDate(newStartTime);
    const newTime = formatTime(newStartTime);
    const baseUrl = origin || "https://704collective.com";
    const eventUrl = `${baseUrl}/events/${eventId}`;

    // Build recipient list (dedup by email)
    const recipients: { email: string; name: string }[] = [];
    const seenEmails = new Set<string>();

    for (const ticket of tickets) {
      if (ticket.user_id && profileMap[ticket.user_id]) {
        const profile = profileMap[ticket.user_id];
        if (!seenEmails.has(profile.email)) {
          seenEmails.add(profile.email);
          recipients.push({ email: profile.email, name: profile.full_name || "there" });
        }
      } else if (ticket.guest_email && !seenEmails.has(ticket.guest_email)) {
        seenEmails.add(ticket.guest_email);
        recipients.push({ email: ticket.guest_email, name: ticket.guest_name || "there" });
      }
    }

    log(`Building batch for ${recipients.length} recipients`);

    // Build batch email array
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const emailMessages = recipients.map(recipient => {
      const { subject, html } = buildEventChangeHtml({
        name: recipient.name,
        eventName,
        oldDate,
        oldTime,
        newDate,
        newTime,
        newLocation: newLocation || undefined,
        eventUrl,
        origin: baseUrl,
      });
      return {
        from: "704 Collective <hello@704collective.com>",
        to: [recipient.email],
        subject,
        html,
      };
    });

    // Send via Resend batch API (chunks of 100)
    const { sent, failed } = await sendResendBatch(resendKey, emailMessages);

    log("Notification complete", { sent, failed, total: recipients.length });

    return new Response(JSON.stringify({ sent, failed, total: recipients.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[NOTIFY-EVENT-CHANGE] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
