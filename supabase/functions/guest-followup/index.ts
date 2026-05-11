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

/** Call the centralised send-email render endpoint to get subject + HTML. */
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
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Allow service role (for cron/internal calls) or admin JWT
    if (token !== serviceRoleKey) {
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
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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

    const allPasses  = passes || [];
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
    // Reuses the existing "guest-followup" template in send-email which
    // accepts { guestName, memberName, eventName, origin }
    const passEmailPromises = allPasses.map(async (pass: any) => {
      const eventName  = eventsMap[pass.event_id] || "our event";
      const memberName = membersMap[pass.member_id] || "a member";
      const { subject, html } = await renderTemplate(supabaseUrl, serviceRoleKey, "guest-followup", {
        guestName:  pass.guest_name,
        memberName,
        eventName,
        origin:     baseUrl,
      });
      return { from: "704 Collective <hello@704collective.com>", to: [pass.guest_email], subject, html };
    });

    // ── Build batch emails for ticket follow-ups ──
    // Reuses the existing "ticket-followup" template in send-email which
    // accepts { guestName, eventName, origin }
    const ticketEmailPromises = allTickets.map(async (ticket: any) => {
      const eventName = eventsMap[ticket.event_id] || "our event";
      const { subject, html } = await renderTemplate(supabaseUrl, serviceRoleKey, "ticket-followup", {
        guestName: ticket.guest_name || "there",
        eventName,
        origin:    baseUrl,
      });
      return { from: "704 Collective <hello@704collective.com>", to: [ticket.guest_email], subject, html };
    });

    const [passEmails, ticketEmails] = await Promise.all([
      Promise.all(passEmailPromises),
      Promise.all(ticketEmailPromises),
    ]);

    // Send all via batch API
    const allEmails = [...passEmails, ...ticketEmails];
    const { sent, failed } = await sendResendBatch(resendKey, allEmails);

    // Mark followup_sent_at for successfully sent items
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
