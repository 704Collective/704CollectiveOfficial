/**
 * event-reminder - daily cron at 11:00 UTC (7 am ET).
 *
 * Also callable manually by admins via POST with { event_id } to target
 * a specific event.
 *
 * For each published event today:
 *  - Members who RSVPed -> "You're registered for today" email
 *  - Active members without an RSVP -> "Join us today" email
 *
 * Respects marketing_unsubscribed on profiles.
 * Sends in Resend batch chunks of <= 100.
 *
 * HTML rendering is centralised via the send-email/render endpoint so all
 * emails share the same baseLayout (UTF-8 charset, 600px centered, branded
 * logo, proper footer). Templates are rendered ONCE per event with a
 * placeholder name ([[NAME]]) that is replaced per-recipient - preserving
 * batch performance.
 */

/**
 * TEST MODE PATTERNS
 *
 * test_recipient_email: render both templates with placeholder data, send only to this address.
 * dry_run: run the real data pipeline (credential query, member filter, batch build)
 *   but DO NOT call Resend. Returns counts in the response so you can validate
 *   the query is finding the right RSVPs without spamming members.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY       = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE_URL       = "https://704collective.com";

const NAME_PLACEHOLDER = "[[NAME]]";

function relativeDateLabel(startTime: string): { phrase: string; dayLabel: string } {
  const eventDate = new Date(startTime);
  const nowEt     = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const todayEt   = new Date(nowEt.getFullYear(), nowEt.getMonth(), nowEt.getDate());
  const tomorrowEt = new Date(todayEt);
  tomorrowEt.setDate(tomorrowEt.getDate() + 1);

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
      timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric",
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
  console.log(`[EVENT-REMINDER] ${step}${d ? " - " + JSON.stringify(d) : ""}`);

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ mode: "render", template, data }),
  });
  if (!res.ok) throw new Error(`Failed to render template ${template}: ${await res.text()}`);
  return res.json() as Promise<{ success: true; subject: string; html: string }>;
}

async function sendBatch(emails: { from: string; to: string; subject: string; html: string }[]) {
  if (emails.length === 0) return 0;
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify(emails),
  });
  if (!res.ok) {
    const err = await res.text();
    log("Resend batch error", { status: res.status, err });
  }
  return emails.length;
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function escapeForHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

interface ProcessResult {
  sent: number;
  registeredCount: number;
  joinUsCount: number;
  guestCount: number;
  rsvpedUserIds: number;
  rsvpedEmails: number;
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  event: EventRow,
  isTestMode = false,
  testRecipient = "",
  dryRun = false,
): Promise<ProcessResult> {
  log("Processing event", { id: event.id, title: event.title, isTestMode, dryRun });

  const { phrase, dayLabel } = relativeDateLabel(event.start_time);

  if (isTestMode) {
    const [registeredRender, joinUsRender] = await Promise.all([
      renderTemplate("event-reminder-registered", {
        name: "Admin (Test)", eventTitle: event.title, eventStartTime: event.start_time,
        locationName: event.location_name, eventUrl: `${SITE_URL}/events/${event.id}`, phrase, dayLabel,
      }),
      renderTemplate("event-reminder-join-us", {
        name: "Admin (Test)", eventTitle: event.title, eventStartTime: event.start_time,
        locationName: event.location_name, eventUrl: `${SITE_URL}/events/${event.id}`, phrase, dayLabel,
      }),
    ]);

    const testEmails = [
      { from: "704 Collective <hello@704collective.com>", to: testRecipient, subject: `[TEST] ${registeredRender.subject}`, html: registeredRender.html },
      { from: "704 Collective <hello@704collective.com>", to: testRecipient, subject: `[TEST] ${joinUsRender.subject}`, html: joinUsRender.html },
    ];
    if (!dryRun) await sendBatch(testEmails);
    log("Test emails sent", { to: testRecipient, count: testEmails.length, dryRun });
    return { sent: dryRun ? 0 : testEmails.length, registeredCount: 1, joinUsCount: 1, guestCount: 0, rsvpedUserIds: 0, rsvpedEmails: 0 };
  }

  const [registeredRender, joinUsRender] = await Promise.all([
    renderTemplate("event-reminder-registered", {
      name: NAME_PLACEHOLDER, eventTitle: event.title, eventStartTime: event.start_time,
      locationName: event.location_name, eventUrl: `${SITE_URL}/events/${event.id}`, phrase, dayLabel,
    }),
    renderTemplate("event-reminder-join-us", {
      name: NAME_PLACEHOLDER, eventTitle: event.title, eventStartTime: event.start_time,
      locationName: event.location_name, eventUrl: `${SITE_URL}/events/${event.id}`, phrase, dayLabel,
    }),
  ]);

  const { data: credentials, error: credErr } = await supabase
    .from("attendance_credentials")
    .select(`
      credential_type,
      status,
      metadata,
      person:people!person_id (
        id,
        email_lower,
        metadata
      )
    `)
    .eq("event_id", event.id)
    .in("credential_type", ["member_rsvp", "public_rsvp", "guest_pass"])
    .in("status", ["active", "used"]);

  if (credErr) {
    log("attendance_credentials query failed", { eventId: event.id, error: credErr.message });
  }

  const rsvpedUserIds = new Set<string>();
  const rsvpedEmailsLower = new Set<string>();
  const guestEmails: string[] = [];

  for (const cred of (credentials || []) as any[]) {
    const person = cred.person;
    if (!person) continue;
    const profileIdFromMeta: string | null = person.metadata?.profile_id ?? null;
    if (profileIdFromMeta) rsvpedUserIds.add(profileIdFromMeta);
    if (person.email_lower) {
      rsvpedEmailsLower.add(person.email_lower);
      if (!profileIdFromMeta && (cred.credential_type === "public_rsvp" || cred.credential_type === "guest_pass")) {
        guestEmails.push(person.email_lower);
      }
    }
  }

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
    const isRsvped = rsvpedUserIds.has(member.id) || rsvpedEmailsLower.has(member.email.toLowerCase());
    const name     = escapeForHtml(member.full_name || "Member");
    if (isRsvped) {
      registeredEmails.push({
        from: "704 Collective <hello@704collective.com>", to: member.email,
        subject: registeredRender.subject, html: registeredRender.html.replace(NAME_PLACEHOLDER, name),
      });
    } else {
      joinUsEmails.push({
        from: "704 Collective <hello@704collective.com>", to: member.email,
        subject: joinUsRender.subject, html: joinUsRender.html.replace(NAME_PLACEHOLDER, name),
      });
    }
  }

  const memberEmailsLower = new Set(activeMembers.map(m => m.email?.toLowerCase()).filter(Boolean) as string[]);
  for (const guestEmail of guestEmails) {
    if (memberEmailsLower.has(guestEmail)) continue;
    registeredEmails.push({
      from: "704 Collective <hello@704collective.com>", to: guestEmail,
      subject: registeredRender.subject, html: registeredRender.html.replace(NAME_PLACEHOLDER, "Guest"),
    });
  }

  let sent = 0;
  if (!dryRun) {
    for (const batch of chunks(registeredEmails, 100)) sent += await sendBatch(batch);
    for (const batch of chunks(joinUsEmails, 100))     sent += await sendBatch(batch);
  }

  log("Processed event", {
    event: event.title, dryRun, sent,
    registered: registeredEmails.length, joinUs: joinUsEmails.length, guests: guestEmails.length,
    rsvpedUserIds: rsvpedUserIds.size, rsvpedEmails: rsvpedEmailsLower.size,
  });

  return {
    sent,
    registeredCount: registeredEmails.length,
    joinUsCount: joinUsEmails.length,
    guestCount: guestEmails.length,
    rsvpedUserIds: rsvpedUserIds.size,
    rsvpedEmails: rsvpedEmailsLower.size,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth gate: every non-OPTIONS request needs a bearer token. The cron path
  // passes by strict service-key equality; anything else must resolve to an
  // admin user. No header at all -> 401 (previously this fell through).
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const isServiceRole = token === SERVICE_KEY;
  if (!isServiceRole) {
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

  let specificEventId: string | null = null;
  let isTestMode = false;
  let testRecipient = "";
  let dryRun = false;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      specificEventId = body?.event_id ?? null;
      dryRun = body?.dry_run === true;

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

    log("Events to process", { count: events.length, dryRun });

    let totalSent = 0;
    const eventResults: any[] = [];
    for (const event of events) {
      const result = await processEvent(supabase, event, isTestMode, testRecipient, dryRun);
      totalSent += result.sent;
      eventResults.push({ eventId: event.id, title: event.title, ...result });
    }

    return new Response(JSON.stringify({
      success: true, events: events.length, sent: totalSent,
      isTestMode, dryRun, results: eventResults,
    }), {
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