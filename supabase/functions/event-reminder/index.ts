/**
 * event-reminder â€” daily cron at 11:00 UTC (7 am ET).
 *
 * Also callable manually by admins via POST with { event_id } to target
 * a specific event.
 *
 * For each published event today:
 *  - Members who RSVPed â†’ "You're registered for today" email
 *  - Active members without an RSVP â†’ "Join us today" email
 *
 * Respects marketing_unsubscribed on profiles.
 * Sends in Resend batch chunks of â‰¤ 100.
 */

/**
 * TEST MODE PATTERN
 *
 * Any admin-facing send function can support a test_recipient_email
 * parameter. When present, the function should render the exact same
 * email content it would normally produce, but route it only to that
 * one address (bypassing audience fanout). Subject lines should be
 * prefixed with "[TEST] " for clarity.
 *
 * This pattern will be added to send-campaign and other send functions
 * as their admin UIs need preview capability.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY       = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE_URL       = "https://704collective.com";

/**
 * Returns a human-readable relative date phrase for an event start time.
 * Examples: "today", "tomorrow", "on Friday", "on Monday, June 2"
 * Always uses Eastern Time for the comparison and display.
 */
function relativeDateLabel(startTime: string): { phrase: string; dayLabel: string } {
  const eventDate = new Date(startTime);

  // Get today in ET
  const nowEt     = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const todayEt   = new Date(nowEt.getFullYear(), nowEt.getMonth(), nowEt.getDate());
  const tomorrowEt = new Date(todayEt);
  tomorrowEt.setDate(tomorrowEt.getDate() + 1);

  // Convert event date to ET-aligned day
  const eventEt  = new Date(eventDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const eventDay = new Date(eventEt.getFullYear(), eventEt.getMonth(), eventEt.getDate());

  const msPerDay  = 24 * 60 * 60 * 1000;
  const diffDays  = Math.round((eventDay.getTime() - todayEt.getTime()) / msPerDay);

  let phrase: string;
  let dayLabel: string;

  if (diffDays === 0) {
    phrase   = "today";
    dayLabel = "today";
  } else if (diffDays === 1) {
    phrase   = "tomorrow";
    dayLabel = "tomorrow";
  } else if (diffDays > 1 && diffDays < 7) {
    const weekday = eventDate.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long" });
    phrase   = `on ${weekday}`;
    dayLabel = `this ${weekday}`;
  } else {
    const formatted = eventDate.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    phrase   = `on ${formatted}`;
    dayLabel = formatted;
  }

  return { phrase, dayLabel };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, d?: unknown) =>
  console.log(`[EVENT-REMINDER] ${step}${d ? " â€” " + JSON.stringify(d) : ""}`);

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/** Send a batch of â‰¤100 emails via Resend batch API. */
async function sendBatch(emails: { from: string; to: string; subject: string; html: string }[]) {
  if (emails.length === 0) return 0;
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(emails),
  });
  if (!res.ok) {
    const err = await res.text();
    log("Resend batch error", { status: res.status, err });
  }
  return emails.length;
}

/** Chunk array into sub-arrays of size n. */
function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function registeredHtml(memberName: string, event: EventRow, phrase: string, dayLabel: string): string {
  const name = memberName || "there";
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#1A1A1A;color:#FAF6F0;padding:32px;text-align:center;">
<img src="https://704collective.com/logo-white.png" alt="704 Collective" width="120" style="display:block;margin:0 auto 24px;" />
<div style="text-align:left;">
<h2 style="color:#C6A664;">You're going ${dayLabel}!</h2>
<p>Hey ${name}, just a reminder â€” you're registered for <strong>${event.title}</strong> ${phrase}.</p>
<p>ðŸ“… ${new Date(event.start_time).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
${event.location_name ? `<p>ðŸ“ ${event.location_name}</p>` : ""}
<a href="${SITE_URL}/events/${event.id}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:8px;font-weight:600;">View Event</a>
<p style="margin-top:24px;font-size:13px;color:#A0A0A0;">See you there! â€” 704 Collective</p>
</div></body></html>`;
}

function joinUsHtml(memberName: string, event: EventRow, phrase: string, dayLabel: string): string {
  const name = memberName || "there";
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#1A1A1A;color:#FAF6F0;padding:32px;text-align:center;">
<img src="https://704collective.com/logo-white.png" alt="704 Collective" width="120" style="display:block;margin:0 auto 24px;" />
<div style="text-align:left;">
<h2 style="color:#C6A664;">Join us ${dayLabel}!</h2>
<p>Hey ${name}, <strong>${event.title}</strong> is happening ${phrase}. RSVP now to secure your spot!</p>
<p>ðŸ“… ${new Date(event.start_time).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
${event.location_name ? `<p>ðŸ“ ${event.location_name}</p>` : ""}
<a href="${SITE_URL}/events/${event.id}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C6A664;color:#1A1A1A;text-decoration:none;border-radius:8px;font-weight:600;">RSVP Now</a>
<p style="margin-top:24px;font-size:13px;color:#A0A0A0;">Hope to see you there! â€” 704 Collective</p>
</div></body></html>`;
}

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  marketing_unsubscribed: boolean | null;
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  event: EventRow,
  isTestMode = false,
  testRecipient = "",
): Promise<number> {
  log("Processing event", { id: event.id, title: event.title, isTestMode });

  const { phrase, dayLabel } = relativeDateLabel(event.start_time);

  // â”€â”€ Test mode: send both preview templates to the requester only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isTestMode) {
    const testEmails = [
      {
        from: "704 Collective <hello@704collective.com>",
        to: testRecipient,
        subject: `[TEST] You're registered for ${event.title} ${dayLabel}!`,
        html: registeredHtml("Admin (Test)", event, phrase, dayLabel),
      },
      {
        from: "704 Collective <hello@704collective.com>",
        to: testRecipient,
        subject: `[TEST] Join us ${dayLabel} â€” ${event.title}`,
        html: joinUsHtml("Admin (Test)", event, phrase, dayLabel),
      },
    ];
    await sendBatch(testEmails);
    log("Test emails sent", { to: testRecipient, count: testEmails.length });
    return testEmails.length;
  }

  // Fetch all confirmed ticket holders for this event
  const { data: tickets } = await supabase
    .from("tickets")
    .select("user_id, guest_email")
    .eq("event_id", event.id)
    .in("status", ["confirmed", "rsvp"]);

  const rsvpedUserIds = new Set<string>(
    (tickets || []).filter((t: any) => t.user_id).map((t: any) => t.user_id as string)
  );

  // Fetch all active members (not marketing-unsubscribed, not deleted)
  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, full_name, marketing_unsubscribed")
    .is("deleted_at", null)
    .in("subscription_status", ["active", "trialing"])
    .eq("marketing_unsubscribed", false);

  const activeMembers: ProfileRow[] = (members || []) as ProfileRow[];

  const registeredEmails: { from: string; to: string; subject: string; html: string }[] = [];
  const joinUsEmails:     { from: string; to: string; subject: string; html: string }[] = [];

  for (const member of activeMembers) {
    if (!member.email) continue;
    const isRsvped = rsvpedUserIds.has(member.id);
    const name     = member.full_name || "Member";
    if (isRsvped) {
      registeredEmails.push({
        from: "704 Collective <hello@704collective.com>",
        to: member.email,
        subject: `You're registered for ${event.title} ${dayLabel}!`,
        html: registeredHtml(name, event, phrase, dayLabel),
      });
    } else {
      joinUsEmails.push({
        from: "704 Collective <hello@704collective.com>",
        to: member.email,
        subject: `Join us ${dayLabel} â€” ${event.title}`,
        html: joinUsHtml(name, event, phrase, dayLabel),
      });
    }
  }

  // Also send registered reminder to guest ticket holders
  for (const ticket of (tickets || []) as any[]) {
    if (ticket.guest_email) {
      registeredEmails.push({
        from: "704 Collective <hello@704collective.com>",
        to: ticket.guest_email,
        subject: `You're registered for ${event.title} ${dayLabel}!`,
        html: registeredHtml("Guest", event, phrase, dayLabel),
      });
    }
  }

  let sent = 0;
  for (const batch of chunks(registeredEmails, 100)) sent += await sendBatch(batch);
  for (const batch of chunks(joinUsEmails, 100))     sent += await sendBatch(batch);

  log("Sent reminders", { event: event.title, sent });
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Allow manual admin invocation with a specific event_id
  let specificEventId: string | null = null;
  let isTestMode = false;
  let testRecipient = "";

  if (req.method === "POST") {
    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = supabaseAdmin();
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["admin", "super_admin"].includes(profile.role ?? "")) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    try {
      const body = await req.json();
      specificEventId = body?.event_id ?? null;

      // A1/A2: Test mode â€” route emails to requester only
      const rawTestEmail: unknown = body?.test_recipient_email;
      if (typeof rawTestEmail === "string" && rawTestEmail.trim().length > 0) {
        const trimmed = rawTestEmail.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return new Response(JSON.stringify({ error: "Invalid test_recipient_email" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        isTestMode = true;
        testRecipient = trimmed;
      }
    } catch { /* ignore */ }
  }

  try {
    const supabase = supabaseAdmin();
    let events: EventRow[] = [];

    if (specificEventId) {
      const { data } = await supabase
        .from("events")
        .select("id, title, start_time, end_time, location_name")
        .eq("id", specificEventId)
        .eq("is_published", true)
        .maybeSingle();
      if (data) events = [data as EventRow];
    } else {
      // Events happening today (UTC boundaries converted to ET)
      const now    = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setUTCHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("events")
        .select("id, title, start_time, end_time, location_name")
        .eq("is_published", true)
        .gte("start_time", todayStart.toISOString())
        .lte("start_time", todayEnd.toISOString());
      events = (data || []) as EventRow[];
    }

    log("Events to process", { count: events.length });

    let totalSent = 0;
    for (const event of events) {
      totalSent += await processEvent(supabase, event, isTestMode, testRecipient);
    }

    return new Response(JSON.stringify({ success: true, events: events.length, sent: totalSent, isTestMode }), {
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
