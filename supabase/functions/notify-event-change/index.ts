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

async function renderTemplate(
  supabaseUrl: string,
  serviceKey: string,
  template: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; html: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ mode: "render", template, data }),
  });
  if (!res.ok) throw new Error(`Failed to render template ${template}: ${await res.text()}`);
  return res.json() as Promise<{ success: true; subject: string; html: string }>;
}

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

    if (i + 100 < emails.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { sent, failed };
}

// UTF-8-safe base64 (btoa alone throws on non-latin1 chars).
// keep in sync with send-email toBase64Utf8
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// keep in sync with send-email buildEventIcs
function buildEventIcs(opts: {
  title: string;
  startIso: string;
  endIso?: string;
  location?: string;
  description?: string;
  uid: string;
  method?: "PUBLISH" | "CANCEL" | "REQUEST";
  status?: "CONFIRMED" | "CANCELLED";
  sequence?: number;
  attendeeEmail?: string;
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const status = opts.status ?? (opts.method === "REQUEST" ? "CONFIRMED" : undefined);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//704 Collective//Events//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method ?? "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `ORGANIZER;CN=704 Collective:mailto:no-reply@704collective.com`,
    ...(opts.attendeeEmail ? [`ATTENDEE;CN=${opts.attendeeEmail};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${opts.attendeeEmail}`] : []),
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(opts.startIso)}`,
    ...(opts.endIso ? [`DTEND:${fmt(opts.endIso)}`] : []),
    `SUMMARY:${esc(opts.title)}`,
    ...(opts.description ? [`DESCRIPTION:${esc(opts.description)}`] : []),
    ...(opts.location ? [`LOCATION:${esc(opts.location)}`] : []),
    `SEQUENCE:${opts.sequence ?? 0}`,
    ...(status ? [`STATUS:${status}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

const NAME_PLACEHOLDER = "[[RECIPIENT_NAME]]";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse body first to check for dry_run
    const body = await req.json();
    const { eventId, eventName, oldStartTime, oldEndTime, newStartTime, newEndTime, newLocation, origin, dry_run } = body;
    const dryRun = dry_run === true;

    // Auth check: skip entirely for dry_run, required for real sends
    if (!dryRun) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      const isServiceRole = token === serviceRoleKey;

      if (!isServiceRole) {
        const userClient = createClient(supabaseUrl, supabaseAnon, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
        if (claimsErr) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const userId = (claimsData?.claims as { sub?: string } | undefined)?.sub;
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: roleCheck } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
        if (!roleCheck) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (!eventId || !eventName || !oldStartTime || !newStartTime) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timesChanged = new Date(oldStartTime).getTime() !== new Date(newStartTime).getTime();
    if (!timesChanged && !newLocation) {
      return new Response(JSON.stringify({ error: "newLocation is required for a location-only change (start/end times are unchanged)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Processing event change notification", { eventId, eventName, dryRun, timesChanged });

    const { data: credentials, error: credErr } = await adminClient
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
      .eq("event_id", eventId)
      .in("credential_type", ["member_rsvp", "public_rsvp", "guest_pass"])
      .in("status", ["active", "used"]);

    if (credErr) {
      log("attendance_credentials query failed", { eventId, error: credErr.message });
      throw credErr;
    }

    const recipients: { email: string; name: string }[] = [];
    const seenEmails = new Set<string>();
    const memberProfileIds: string[] = [];

    for (const cred of (credentials || []) as any[]) {
      const person = cred.person;
      if (!person || !person.email) continue;

      const profileIdFromMeta: string | null = person.metadata?.profile_id ?? null;
      if (profileIdFromMeta) memberProfileIds.push(profileIdFromMeta);
    }

    let profileMap: Record<string, { full_name: string | null; email: string }> = {};
    if (memberProfileIds.length > 0) {
      const { data: profiles } = await adminClient
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

    for (const cred of (credentials || []) as any[]) {
      const person = cred.person;
      if (!person || !person.email) continue;

      const profileIdFromMeta: string | null = person.metadata?.profile_id ?? null;
      let email: string;
      let name: string;

      if (profileIdFromMeta && profileMap[profileIdFromMeta]) {
        email = profileMap[profileIdFromMeta].email;
        name = profileMap[profileIdFromMeta].full_name || person.full_name || "there";
      } else {
        email = person.email;
        name = person.full_name || "there";
      }

      const emailLower = email.toLowerCase();
      if (seenEmails.has(emailLower)) continue;
      seenEmails.add(emailLower);
      recipients.push({ email, name });
    }

    // Public RSVPs live in event_public_rsvps (not attendance_credentials). Merge them in,
    // running through the same lowercased-email dedupe so members already added win.
    const { data: publicRsvps, error: publicErr } = await adminClient
      .from("event_public_rsvps")
      .select("email, first_name, last_name")
      .eq("event_id", eventId)
      .eq("status", "rsvp");

    if (publicErr) {
      log("event_public_rsvps query failed", { eventId, error: publicErr.message });
      throw publicErr;
    }

    for (const r of (publicRsvps || []) as any[]) {
      if (!r.email) continue;
      const emailLower = r.email.toLowerCase();
      if (seenEmails.has(emailLower)) continue;
      seenEmails.add(emailLower);
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "there";
      recipients.push({ email: r.email, name });
    }

    if (recipients.length === 0) {
      log("No recipients to notify");
      return new Response(JSON.stringify({ sent: 0, failed: 0, total: 0, dryRun }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      timeZone: "America/New_York",
    });
    const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
    });

    const oldDate = formatDate(oldStartTime);
    const oldTime = formatTime(oldStartTime);
    const newDate = formatDate(newStartTime);
    const newTime = formatTime(newStartTime);

    const baseUrl = origin || "https://704collective.com";
    const eventUrl = `${baseUrl}/events/${eventId}`;

    const changeMessage = timesChanged
      ? `This event has been rescheduled from ${oldDate} at ${oldTime} to ${newDate} at ${newTime}.${newLocation ? ` New location: ${newLocation}.` :""}`
      : `The location for this event has changed. New location: ${newLocation}. The date and time are unchanged: ${newDate} at ${newTime}.`;

    log(`Building batch for ${recipients.length} recipients`, { dryRun });

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        recipientCount: recipients.length,
        recipients: recipients.map(r => ({ email: r.email, name: r.name })),
        changeMessage,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    // ── Advance the per-event ICS sequence so the calendar update supersedes the
    // original invite (a VEVENT SEQUENCE must increase for the same UID). No RPC:
    // read the current value, then conditionally bump it guarded on the value we
    // read (optimistic concurrency). Event edits are a single-admin action so
    // contention is near zero; if a concurrent writer beats us (0 rows updated),
    // we re-read and retry once. On ANY error we log ICS_SEQ_ERROR and fall back
    // to the text-only email — sequence coherence is best-effort, never a blocker.
    let icsSequence: number | null = null;
    try {
      for (let attempt = 0; attempt < 2 && icsSequence === null; attempt++) {
        const { data: seqRow, error: readErr } = await adminClient
          .from("events")
          .select("ics_sequence")
          .eq("id", eventId)
          .single();
        if (readErr) throw readErr;

        const current = typeof seqRow?.ics_sequence === "number" ? seqRow.ics_sequence : 0;
        const next = current + 1;

        const { data: updatedRows, error: updErr } = await adminClient
          .from("events")
          .update({ ics_sequence: next })
          .eq("id", eventId)
          .eq("ics_sequence", current)
          .select("ics_sequence");
        if (updErr) throw updErr;

        if (updatedRows && updatedRows.length > 0) {
          icsSequence = next; // won the CAS
        }
        // else: another writer changed it between read and update — loop re-reads once.
      }
      if (icsSequence === null) {
        console.error("[NOTIFY-EVENT-CHANGE] ICS_SEQ_ERROR", "optimistic increment lost the CAS twice");
      }
    } catch (seqErr) {
      console.error("[NOTIFY-EVENT-CHANGE] ICS_SEQ_ERROR", String(seqErr));
    }

    // Authoritative POST-edit event fields for the ICS. The admin save is committed
    // before this function runs, so the row already holds the new values; fall back
    // to the request payload if the row can't be read.
    let icsStart: string | undefined = newStartTime;
    let icsEnd: string | undefined = newEndTime || undefined;
    let icsLocation: string | undefined = newLocation || undefined;
    try {
      const { data: freshEvt } = await adminClient
        .from("events")
        .select("start_time, end_time, location_name, location_address")
        .eq("id", eventId)
        .maybeSingle();
      if (freshEvt) {
        icsStart = freshEvt.start_time ?? icsStart;
        icsEnd = freshEvt.end_time ?? icsEnd;
        icsLocation = [freshEvt.location_name, freshEvt.location_address].filter(Boolean).join(", ") || icsLocation;
      }
    } catch (freshErr) {
      log("fresh event fetch failed (non-fatal, using payload values)", { error: String(freshErr) });
    }

    // Only attach a METHOD:REQUEST update.ics when we have a coherent sequence and
    // a start time. Resend's batch endpoint does NOT support attachments, so when
    // attaching we fan out to individual /emails sends with a short delay.
    const attachInvite = icsSequence !== null && !!icsStart;

    const { subject, html: htmlTemplate } = await renderTemplate(
      supabaseUrl, serviceRoleKey, "event-change-notification",
      {
        name: NAME_PLACEHOLDER,
        eventTitle: eventName,
        eventUrl,
        changeMessage,
        newStartTime,
        newLocation: newLocation || undefined,
      },
    );

    const emailMessages = recipients.map(recipient => {
      const safeName = recipient.name
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return {
        from: "704 Collective <hello@704collective.com>",
        to: [recipient.email],
        subject,
        html: htmlTemplate.replace(NAME_PLACEHOLDER, safeName),
      };
    });

    let sent = 0;
    let failed = 0;
    if (attachInvite) {
      // Individual sends (POST /emails) so each recipient gets their own invite
      // with an ATTENDEE line. A short delay keeps us under Resend's send rate.
      for (const msg of emailMessages) {
        const attendeeEmail = msg.to[0];
        try {
          const ics = buildEventIcs({
            title: eventName,
            startIso: icsStart!,
            endIso: icsEnd,
            location: icsLocation,
            uid: `${eventId}@704collective.com`,
            method: "REQUEST",
            status: "CONFIRMED",
            sequence: icsSequence!,
            attendeeEmail,
          });
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              ...msg,
              attachments: [{ filename: "update.ics", content: toBase64Utf8(ics), content_type: "text/calendar; method=REQUEST" }],
            }),
          });
          if (res.ok) {
            sent++;
          } else {
            failed++;
            log("individual send failed", { status: res.status, body: await res.text() });
          }
        } catch (sendErr) {
          failed++;
          log("individual send error", { error: String(sendErr) });
        }
        await new Promise(r => setTimeout(r, 250));
      }
    } else {
      ({ sent, failed } = await sendResendBatch(resendKey, emailMessages));
    }

    // Best-effort audit trail: one email_log row per recipient. Batches here are single-chunk
    // (<=100), so status is all-sent or all-failed. A logging failure must NEVER fail the send.
    try {
      const logStatus = failed === 0 ? "sent" : "failed";
      const nowIso = new Date().toISOString();
      const logRows = recipients.map((r) => ({
        to_email: r.email,
        to_name: r.name,
        subject,
        template: "event-change-notification",
        campaign_id: null,
        status: logStatus,
        sent_at: logStatus === "sent" ? nowIso : null,
        failed_at: logStatus === "failed" ? nowIso : null,
        metadata: { event_id: eventId, source: "notify-event-change" },
      }));
      const { error: logErr } = await adminClient.from("email_log").insert(logRows);
      if (logErr) log("email_log insert failed (non-fatal)", { error: logErr.message });
    } catch (logCatch) {
      log("email_log insert threw (non-fatal)", { error: String(logCatch) });
    }

    log("Notification complete", { sent, failed, total: recipients.length });

    return new Response(JSON.stringify({ sent, failed, total: recipients.length, dryRun: false }), {
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