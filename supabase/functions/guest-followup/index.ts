import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * guest-followup - cron 1-25 hours after event end.
 *
 * Sends a "thanks for coming + soft member pitch" email to:
 *   1. Non-member guests who attended via attendance_credentials
 *      (credential_type IN ('guest_pass', 'public_rsvp'), status='used' or 'active')
 *   2. Paid guest ticket holders from the legacy tickets table
 *      (user_id IS NULL, status='confirmed') - kept as dual-read so create-guest-pass's
 *      tickets write path still flows through.
 *
 * Dedupe: stamps metadata.followup_sent_at on the source row after a successful send.
 *
 * Cron: post-event window (events ending 1-25 hours ago).
 * Admin-callable: pass { event_id } to target a specific event.
 * Dry-run: pass { dry_run: true } to see what would be sent without sending.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GUEST-FOLLOWUP] ${step}${d}`);
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse body for dry_run / event_id / origin
    let eventId: string | null = null;
    let origin: string | null = null;
    let dryRun = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        eventId = body.event_id || null;
        origin = body.origin || null;
        dryRun = body.dry_run === true;
      } catch { /* no body - normal cron */ }
    }

    // Auth: skip for dry_run, otherwise require service-role or admin
    if (!dryRun) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      const isServiceRole = token === serviceRoleKey;
      if (!isServiceRole) {
        const supabaseAuth = createClient(
          supabaseUrl,
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
        if (claimsErr || !claimsData?.claims) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: roleData } = await supabase
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
    }

    log("Starting", { eventId, origin, dryRun });

    // Determine the event window
    let eventIdsToProcess: string[] = [];
    if (eventId) {
      eventIdsToProcess = [eventId];
    } else {
      const now = new Date();
      const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      const { data: recentEvents } = await supabase
        .from("events")
        .select("id")
        .lte("end_time", oneHourAgo.toISOString())
        .gte("end_time", twentyFiveHoursAgo.toISOString());

      eventIdsToProcess = (recentEvents || []).map((e: { id: string }) => e.id);
    }

    if (eventIdsToProcess.length === 0) {
      log("No recently ended events found");
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "No recently ended events", dryRun }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Event IDs in window", { count: eventIdsToProcess.length });

    // Source 1: attendance_credentials (new canonical) - guest_pass + public_rsvp,
    // un-followed-up, with person info. Active members are excluded later.
    const { data: credentials, error: credErr } = await supabase
      .from("attendance_credentials")
      .select(`
        id,
        credential_type,
        status,
        metadata,
        event_id,
        person:people!person_id (
          id,
          email,
          email_lower,
          full_name,
          metadata
        )
      `)
      .in("event_id", eventIdsToProcess)
      .in("credential_type", ["guest_pass", "public_rsvp"])
      .in("status", ["active", "used"]);

    if (credErr) {
      log("attendance_credentials query failed", { error: credErr.message });
    }

    // Source 2: tickets (legacy) - guest tickets only (user_id IS NULL)
    const { data: tickets, error: ticketErr } = await supabase
      .from("tickets")
      .select("id, guest_name, guest_email, event_id, metadata")
      .is("user_id", null)
      .eq("status", "confirmed")
      .not("guest_email", "is", null)
      .in("event_id", eventIdsToProcess);

    if (ticketErr) {
      log("tickets query failed", { error: ticketErr.message });
    }

    const allCredentials = (credentials || []).filter((c: any) =>
      !(c.metadata && c.metadata.followup_sent_at)
    );
    const allTickets = (tickets || []).filter((t: any) =>
      !(t.metadata && t.metadata.followup_sent_at)
    );

    log("Eligible (after dedupe filter)", {
      credentials: allCredentials.length,
      tickets: allTickets.length,
    });

    if (allCredentials.length === 0 && allTickets.length === 0) {
      log("No follow-ups owed");
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "No follow-ups to send", dryRun }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up event titles for all targeted events
    const { data: eventRows } = await supabase
      .from("events")
      .select("id, title")
      .in("id", eventIdsToProcess);
    const eventsMap: Record<string, string> = {};
    for (const e of (eventRows || []) as any[]) {
      eventsMap[e.id] = e.title;
    }

    // Exclude active members from the guest list - members shouldn't get "thanks for coming as a guest" emails
    const allGuestEmails = new Set<string>();
    for (const c of allCredentials as any[]) {
      const p = c.person;
      if (p?.email_lower) allGuestEmails.add(p.email_lower);
    }
    for (const t of allTickets as any[]) {
      if (t.guest_email) allGuestEmails.add(t.guest_email.toLowerCase());
    }
    const guestEmailsList = Array.from(allGuestEmails);

    const activeMemberEmails = new Set<string>();
    if (guestEmailsList.length > 0) {
      const { data: activeProfiles } = await supabase
        .from("profiles")
        .select("email")
        .in("email", guestEmailsList)
        .eq("subscription_status", "active")
        .is("deleted_at", null);
      for (const p of (activeProfiles || []) as any[]) {
        if (p.email) activeMemberEmails.add(p.email.toLowerCase());
      }
    }

    log("Active members excluded", { count: activeMemberEmails.size });

    const baseUrl = origin || "https://704collective.com";

    // Build email payloads (one per credential / ticket, deduped by email per event)
    type EmailPlan = {
      sourceTable: "attendance_credentials" | "tickets";
      sourceId: string;
      guestEmail: string;
      guestName: string;
      eventName: string;
      eventId: string;
    };
    const plans: EmailPlan[] = [];
    const seenPerEvent = new Set<string>();

    for (const c of allCredentials as any[]) {
      const p = c.person;
      if (!p?.email_lower) continue;
      const emailLower = p.email_lower;
      if (activeMemberEmails.has(emailLower)) continue;
      const dedupeKey = `${c.event_id}::${emailLower}`;
      if (seenPerEvent.has(dedupeKey)) continue;
      seenPerEvent.add(dedupeKey);
      plans.push({
        sourceTable: "attendance_credentials",
        sourceId: c.id,
        guestEmail: p.email,
        guestName: p.full_name || "there",
        eventName: eventsMap[c.event_id] || "our event",
        eventId: c.event_id,
      });
    }

    for (const t of allTickets as any[]) {
      const emailLower = (t.guest_email || "").toLowerCase();
      if (!emailLower) continue;
      if (activeMemberEmails.has(emailLower)) continue;
      const dedupeKey = `${t.event_id}::${emailLower}`;
      if (seenPerEvent.has(dedupeKey)) continue;
      seenPerEvent.add(dedupeKey);
      plans.push({
        sourceTable: "tickets",
        sourceId: t.id,
        guestEmail: t.guest_email,
        guestName: t.guest_name || "there",
        eventName: eventsMap[t.event_id] || "our event",
        eventId: t.event_id,
      });
    }

    log("Email plans built", { count: plans.length, dryRun });

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        planCount: plans.length,
        plans: plans.slice(0, 20).map(p => ({
          to: p.guestEmail,
          name: p.guestName,
          event: p.eventName,
          source: p.sourceTable,
        })),
        eventCount: eventIdsToProcess.length,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (plans.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, total: 0, dryRun: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    // Render the two templates for each unique event (cached)
    const renderedByEvent: Record<string, { subject: string; html: string }> = {};
    for (const plan of plans) {
      if (renderedByEvent[plan.eventId]) continue;
      // We use the same template for both - "guest-followup" - consistent thank-you-plus-pitch
      const { subject, html } = await renderTemplate(
        supabaseUrl, serviceRoleKey, "guest-followup",
        {
          guestName: "[[GUEST_NAME]]",
          memberName: "a member",
          eventName: plan.eventName,
          origin: baseUrl,
        },
      );
      renderedByEvent[plan.eventId] = { subject, html };
    }

    // Build the actual emails
    const emails = plans.map(p => {
      const tmpl = renderedByEvent[p.eventId];
      const safeName = p.guestName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return {
        from: "704 Collective <hello@704collective.com>",
        to: [p.guestEmail],
        subject: tmpl.subject,
        html: tmpl.html.replace(/\[\[GUEST_NAME\]\]/g, safeName),
      };
    });

    const { sent, failed } = await sendResendBatch(resendKey, emails);

    // Stamp metadata on each source row to dedupe future runs
    if (sent > 0) {
      const nowIso = new Date().toISOString();

      // Group by source table for batch updates
      const credentialIds = plans.filter(p => p.sourceTable === "attendance_credentials").map(p => p.sourceId);
      const ticketIds = plans.filter(p => p.sourceTable === "tickets").map(p => p.sourceId);

      // Update each credential individually (jsonb merge with existing metadata)
      for (const credId of credentialIds) {
        // Read current metadata first to merge
        const { data: current } = await supabase
          .from("attendance_credentials")
          .select("metadata")
          .eq("id", credId)
          .maybeSingle();
        const newMeta = { ...(current?.metadata ?? {}), followup_sent_at: nowIso };
        await supabase
          .from("attendance_credentials")
          .update({ metadata: newMeta })
          .eq("id", credId);
      }

      for (const ticketId of ticketIds) {
        const { data: current } = await supabase
          .from("tickets")
          .select("metadata")
          .eq("id", ticketId)
          .maybeSingle();
        const newMeta = { ...(current?.metadata ?? {}), followup_sent_at: nowIso };
        await supabase
          .from("tickets")
          .update({ metadata: newMeta })
          .eq("id", ticketId);
      }
    }

    log("Complete", { sent, failed });

    return new Response(
      JSON.stringify({ sent, failed, total: emails.length, dryRun: false }),
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