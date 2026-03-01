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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      // Manual trigger: specific event
      query = query.eq("event_id", eventId);
    } else {
      // Auto trigger: find events that ended 1-25 hours ago
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
          JSON.stringify({ sent: 0, errors: 0, message: "No recently ended events" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      query = query.in("event_id", recentEventIds);
    }

    const { data: passes, error: passError } = await query;
    if (passError) throw passError;

    if (!passes || passes.length === 0) {
      log("No eligible guest passes found");
      return new Response(
        JSON.stringify({ sent: 0, errors: 0, message: "No follow-ups to send" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Found ${passes.length} eligible passes`);

    // Gather unique event IDs and member IDs
    const eventIds = [...new Set(passes.map((p: { event_id: string }) => p.event_id).filter(Boolean))];
    const memberIds = [...new Set(passes.map((p: { member_id: string }) => p.member_id))];

    // Batch fetch events and members
    const [eventsResult, membersResult] = await Promise.all([
      supabase.from("events").select("id, title").in("id", eventIds),
      supabase.from("profiles").select("id, full_name").in("id", memberIds),
    ]);

    const eventsMap: Record<string, string> = {};
    (eventsResult.data || []).forEach((e: { id: string; title: string }) => {
      eventsMap[e.id] = e.title;
    });

    const membersMap: Record<string, string> = {};
    (membersResult.data || []).forEach((m: { id: string; full_name: string | null }) => {
      membersMap[m.id] = m.full_name || "a member";
    });

    let sent = 0;
    let errors = 0;

    for (const pass of passes) {
      const eventName = eventsMap[pass.event_id] || "our event";
      const memberName = membersMap[pass.member_id] || "a member";
      const baseUrl = origin || "https://704collective.com";

      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            to: pass.guest_email,
            template: "guest-followup",
            data: {
              guestName: pass.guest_name,
              memberName,
              eventName,
              origin: baseUrl,
            },
          }),
        });

        if (emailRes.ok) {
          // Stamp followup_sent_at
          await supabase
            .from("guest_passes")
            .update({ followup_sent_at: new Date().toISOString() })
            .eq("id", pass.id);
          sent++;
          log("Sent follow-up", { passId: pass.id, guest: pass.guest_email });
        } else {
          const errBody = await emailRes.text();
          log("Email send failed", { passId: pass.id, status: emailRes.status, body: errBody });
          errors++;
        }
      } catch (err) {
        log("Error sending", { passId: pass.id, error: String(err) });
        errors++;
      }
    }

    log("Complete", { sent, errors });

    return new Response(
      JSON.stringify({ sent, errors }),
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
