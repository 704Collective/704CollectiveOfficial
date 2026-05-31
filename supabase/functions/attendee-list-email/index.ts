/**
 * attendee-list-email - cron every 30 minutes.
 *
 * Checks for events starting in the next 60-90 minute window.
 * Sends a formatted attendee list to hello@704collective.com.
 * Uses financial_cache to track which events have already been sent
 * (to prevent duplicate sends).
 *
 * HTML is rendered via the centralised send-email render endpoint so the
 * attendee list email shares the same baseLayout as all other 704 emails.
 *
 * SCHEMA NOTE: As of the sweep, RSVPs are stored in attendance_credentials,
 * not tickets. This function reads from both attendance_credentials AND
 * event_public_rsvps to cover any old data that may still exist in the
 * public RSVP table.
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
  name: string;
  email: string;
  isGuest: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = supabaseAdmin();

    // Parse body for dry_run / specific_event_id (admin tooling)
    let dryRun = false;
    let specificEventId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        dryRun = body?.dry_run === true;
        specificEventId = body?.event_id ?? null;
      } catch { /* no body, normal cron path */ }
    }

    // Auth check: skip for dry_run, otherwise require admin
    if (!dryRun) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const token = authHeader.replace("Bearer ", "").trim();
      const isServiceRole = token === SERVICE_KEY;
      if (!isServiceRole) {
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
      }
    }

    const now      = new Date();
    let events: EventRow[] = [];

    if (specificEventId) {
      const { data } = await supabase
        .from("events")
        .select("id, title, start_time, location_name")
        .eq("id", specificEventId)
        .eq("is_published", true)
        .maybeSingle();
      if (data) events = [data as EventRow];
    } else {
      const winStart = new Date(now.getTime() + 60 * 60 * 1000);
      const winEnd   = new Date(now.getTime() + 90 * 60 * 1000);

      const { data } = await supabase
        .from("events")
        .select("id, title, start_time, location_name")
        .eq("is_published", true)
        .gte("start_time", winStart.toISOString())
        .lte("start_time", winEnd.toISOString());
      events = (data || []) as EventRow[];
    }

    log("Events in window", { count: events.length, dryRun });

    let sent = 0;
    const results: any[] = [];

    for (const event of events) {
      const cacheKey = `attendee-list-sent:${event.id}`;

      // Skip cache check on dry_run
      if (!dryRun) {
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
      }

      // Fetch attendees from attendance_credentials (joined to people, then to profiles for member names)
      const { data: credentials, error: credErr } = await supabase
        .from("attendance_credentials")
        .select(`
          credential_type,
          status,
          person:people!person_id (
            id,
            email,
            email_lower,
            full_name,
            metadata
          )
        `)
        .eq("event_id", event.id)
        .in("credential_type", ["member_rsvp", "public_rsvp", "guest_pass"])
        .in("status", ["active", "used"]);

      if (credErr) {
        log("attendance_credentials query failed", { eventId: event.id, error: credErr.message });
      }

      // Collect profile IDs for member name resolution
      const memberProfileIds: string[] = [];
      for (const cred of (credentials || []) as any[]) {
        const person = cred.person;
        if (!person) continue;
        const profileId: string | null = person.metadata?.profile_id ?? null;
        if (profileId) memberProfileIds.push(profileId);
      }

      let profileMap: Record<string, { full_name: string | null; email: string }> = {};
      if (memberProfileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", memberProfileIds)
          .is("deleted_at", null);
        if (profiles) {
          for (const p of profiles) {
            profileMap[p.id] = { full_name: p.full_name, email: p.email };
          }
        }
      }

      // Build attendee list from credentials
      const attendees: AttendeeRow[] = [];
      const seenEmails = new Set<string>();

      for (const cred of (credentials || []) as any[]) {
        const person = cred.person;
        if (!person || !person.email) continue;

        const profileId: string | null = person.metadata?.profile_id ?? null;
        let name: string;
        let email: string;
        let isGuest: boolean;

        if (profileId && profileMap[profileId]) {
          email = profileMap[profileId].email;
          name = profileMap[profileId].full_name || person.full_name || "(No name)";
          isGuest = false;
        } else {
          email = person.email;
          name = person.full_name || "(No name)";
          isGuest = true;
        }

        const emailLower = email.toLowerCase();
        if (seenEmails.has(emailLower)) continue;
        seenEmails.add(emailLower);
        attendees.push({ name, email, isGuest });
      }

      // Also fetch from event_public_rsvps for any legacy data not in attendance_credentials
      const { data: publicRsvps, error: rsvpErr } = await supabase
        .from("event_public_rsvps")
        .select("first_name, last_name, email")
        .eq("event_id", event.id)
        .eq("status", "rsvp");

      if (rsvpErr) {
        log("event_public_rsvps query error (non-fatal)", { event: event.id, msg: rsvpErr.message });
      } else {
        for (const r of (publicRsvps || []) as any[]) {
          if (!r.email) continue;
          const emailLower = r.email.toLowerCase();
          if (seenEmails.has(emailLower)) continue;
          seenEmails.add(emailLower);
          const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "(No name)";
          attendees.push({ name, email: r.email, isGuest: true });
        }
      }

      log("Attendees collected", { event: event.id, count: attendees.length });

      if (dryRun) {
        results.push({
          eventId: event.id,
          title: event.title,
          attendeeCount: attendees.length,
          attendees,
        });
        continue;
      }

      const { subject, html } = await renderTemplate("attendee-list-summary", {
        eventTitle:     event.title,
        eventStartTime: event.start_time,
        attendees,
      });

      await sendEmail(`[Attendee List] ${event.title} - starting soon`, html);

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

    if (dryRun) {
      return new Response(JSON.stringify({ dryRun: true, eventCount: events.length, results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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