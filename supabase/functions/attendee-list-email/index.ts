/**
 * attendee-list-email — cron every 30 minutes.
 *
 * Checks for events starting in the next 60–90 minute window.
 * Sends a formatted attendee list to hello@704collective.com.
 * Uses financial_cache to track which events have already been sent
 * (to prevent duplicate sends).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAIL    = "hello@704collective.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, d?: unknown) =>
  console.log(`[ATTENDEE-LIST-EMAIL] ${step}${d ? " — " + JSON.stringify(d) : ""}`);

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function sendEmail(subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "704 Collective <hello@704collective.com>",
      to: ADMIN_EMAIL,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    log("Resend error", { status: res.status, err });
  }
}

function buildAttendeeListHtml(event: EventRow, attendees: AttendeeRow[]): string {
  const startFormatted = new Date(event.start_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  const rows = attendees.map((a) => {
    const name  = a.full_name || a.guest_name || "(No name)";
    const email = a.email     || a.guest_email || "";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #333;">${name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #333;color:#A0A0A0;">${email}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html>
<body style="font-family:sans-serif;background:#1A1A1A;color:#FAF6F0;padding:32px;">
<img src="https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/704-logo.png" alt="704 Collective" width="120" style="margin-bottom:24px;" />
<h2 style="color:#C6A664;margin:0 0 8px;">Attendee List</h2>
<h3 style="margin:0 0 16px;">${event.title}</h3>
<p style="color:#D8D8D8;margin:0 0 4px;">📅 ${startFormatted}</p>
${event.location_name ? `<p style="color:#D8D8D8;margin:0 0 16px;">📍 ${event.location_name}</p>` : ""}
<p style="margin:0 0 16px;"><strong style="color:#C6A664;">${attendees.length}</strong> total RSVPs</p>
<table style="width:100%;border-collapse:collapse;background:#2E2E2E;border-radius:8px;overflow:hidden;">
<thead>
<tr style="background:#3A3A3A;">
<th style="padding:10px 12px;text-align:left;color:#C6A664;">Name</th>
<th style="padding:10px 12px;text-align:left;color:#C6A664;">Email</th>
</tr>
</thead>
<tbody>${rows || '<tr><td colspan="2" style="padding:16px;color:#A0A0A0;text-align:center;">No attendees yet</td></tr>'}</tbody>
</table>
<p style="margin-top:24px;font-size:13px;color:#A0A0A0;">Sent automatically by 704 Collective — 60 minutes before the event.</p>
</body></html>`;
}

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  location_name: string | null;
}

interface AttendeeRow {
  full_name: string | null;
  email: string | null;
  guest_name: string | null;
  guest_email: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = supabaseAdmin();

    const now      = new Date();
    const winStart = new Date(now.getTime() + 60 * 60 * 1000); // +60 min
    const winEnd   = new Date(now.getTime() + 90 * 60 * 1000); // +90 min

    const { data: events } = await supabase
      .from("events")
      .select("id, title, start_time, location_name")
      .eq("is_published", true)
      .gte("start_time", winStart.toISOString())
      .lte("start_time", winEnd.toISOString());

    log("Events in window", { count: (events || []).length });

    let sent = 0;

    for (const event of (events || []) as EventRow[]) {
      const cacheKey = `attendee-list-sent:${event.id}`;

      // Check if already sent for this event
      const { data: cached } = await supabase
        .from("financial_cache")
        .select("id")
        .eq("cache_key", cacheKey)
        .gt("expires_at", now.toISOString())
        .maybeSingle();

      if (cached) {
        log("Already sent for event, skipping", { id: event.id });
        continue;
      }

      // Fetch all confirmed tickets with attendee info
      const { data: tickets } = await supabase
        .from("tickets")
        .select(`
          user_id, guest_email, guest_name,
          profiles:user_id (full_name, email)
        `)
        .eq("event_id", event.id)
        .in("status", ["confirmed", "rsvp"]);

      const attendees: AttendeeRow[] = (tickets || []).map((t: any) => ({
        full_name:   t.profiles?.full_name  ?? null,
        email:       t.profiles?.email      ?? null,
        guest_name:  t.guest_name           ?? null,
        guest_email: t.guest_email          ?? null,
      }));

      const html = buildAttendeeListHtml(event, attendees);
      await sendEmail(`[Attendee List] ${event.title} — starting soon`, html);

      // Mark as sent (cache for 4 hours)
      const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      await supabase
        .from("financial_cache")
        .upsert(
          { cache_key: cacheKey, data: { event_id: event.id, sent_at: now.toISOString() }, expires_at: expiresAt.toISOString() },
          { onConflict: "cache_key" }
        );

      log("Attendee list sent", { event: event.title, attendees: attendees.length });
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Error", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
