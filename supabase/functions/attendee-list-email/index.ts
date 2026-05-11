/**
 * attendee-list-email — cron every 30 minutes.
 *
 * Checks for events starting in the next 60–90 minute window.
 * Sends a formatted attendee list to hello@704collective.com.
 * Uses financial_cache to track which events have already been sent
 * (to prevent duplicate sends).
 *
 * HTML is rendered via the centralised send-email render endpoint so the
 * attendee list email shares the same baseLayout as all other 704 emails.
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
  console.log(`[ATTENDEE-LIST-EMAIL] ${step}${d ? " - " + JSON.stringify(d) : ""}`);

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/** Call the centralised send-email render endpoint to get subject + HTML. */
async function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ mode: "render", template, data }),
  });
  if (!res.ok) throw new Error(`Failed to render template ${template}: ${await res.text()}`);
  return res.json() as Promise<{ success: true; subject: string; html: string }>;
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

      // Fetch Public RSVPs
      const { data: publicRsvps, error: rsvpErr } = await supabase
        .from("event_public_rsvps")
        .select("first_name, last_name, email")
        .eq("event_id", event.id)
        .eq("status", "rsvp");

      if (rsvpErr) {
        log("event_public_rsvps query error (non-fatal)", { event: event.id, msg: rsvpErr.message });
      } else {
        const publicRsvpRows: AttendeeRow[] = (publicRsvps || [])
          .filter((r: any) => r.email)
          .map((r: any) => ({
            full_name:   null,
            email:       null,
            guest_name:  `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || null,
            guest_email: r.email as string,
          }));
        log("Public RSVPs fetched", { event: event.id, count: publicRsvpRows.length });
        attendees.push(...publicRsvpRows);
      }

      // Dedupe by lowercased email
      const seenEmails = new Map<string, AttendeeRow>();
      for (const a of attendees) {
        const key = (a.email || a.guest_email || "").toLowerCase().trim();
        if (key && !seenEmails.has(key)) seenEmails.set(key, a);
        else if (!key && !seenEmails.has(`__nomail_${seenEmails.size}`)) {
          seenEmails.set(`__nomail_${seenEmails.size}`, a);
        }
      }
      const dedupedAttendees = Array.from(seenEmails.values());

      // Map to the template's expected format
      const templateAttendees = dedupedAttendees.map(a => ({
        name:    a.full_name || a.guest_name || "(No name)",
        email:   a.email     || a.guest_email || "",
        isGuest: !a.full_name,
      }));

      const { subject, html } = await renderTemplate("attendee-list-summary", {
        eventTitle:     event.title,
        eventStartTime: event.start_time,
        attendees:      templateAttendees,
      });

      await sendEmail(`[Attendee List] ${event.title} - starting soon`, html);

      // Mark as sent (cache for 4 hours)
      const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      await supabase
        .from("financial_cache")
        .upsert(
          { cache_key: cacheKey, data: { event_id: event.id, sent_at: now.toISOString() }, expires_at: expiresAt.toISOString() },
          { onConflict: "cache_key" }
        );

      log("Attendee list sent", { event: event.title, attendees: dedupedAttendees.length });
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
