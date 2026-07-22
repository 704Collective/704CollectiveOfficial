// AUTH PATTERN: browser member call. Verifies the caller's user JWT, then
// uses a service-role client for the DB write. Do NOT apply the cron
// service-role-bearer pattern here.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step, details) => {
  const d = details ? " - " + JSON.stringify(details) : "";
  console.log("[VOID-CREDENTIAL] " + step + d);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const userResult = await userClient.auth.getUser(token);
    const user = userResult.data.user;
    if (userResult.error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memberUserId = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const event_id = body.event_id;
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const personResult = await adminClient
      .from("people")
      .select("id")
      .filter("metadata->>profile_id", "eq", memberUserId)
      .maybeSingle();

    if (personResult.error || !personResult.data) {
      log("person row not found", { memberUserId });
      return new Response(JSON.stringify({ error: "Member record not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const personId = personResult.data.id;

    const credResult = await adminClient
      .from("attendance_credentials")
      .select("id, status")
      .eq("person_id", personId)
      .eq("event_id", event_id)
      .eq("credential_type", "member_rsvp")
      .eq("status", "active")
      .maybeSingle();

    if (credResult.error) {
      log("credential lookup failed", { error: credResult.error.message });
      return new Response(JSON.stringify({ error: "Could not look up RSVP" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!credResult.data) {
      log("no active credential to void", { personId: personId, event_id: event_id });
      return new Response(JSON.stringify({ success: true, voided: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updateResult = await adminClient
      .from("attendance_credentials")
      .update({ status: "voided" })
      .eq("id", credResult.data.id);

    if (updateResult.error) {
      log("void update failed", { error: updateResult.error.message });
      return new Response(JSON.stringify({ error: "Failed to cancel RSVP" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("credential voided", { credId: credResult.data.id, personId: personId, event_id: event_id });

    // ── Cancellation confirmation email to the cancelling member ──────────────
    // Fires on every successful self-void, independent of capacity/waitlist.
    // Non-fatal: the void has already succeeded above; a send failure must
    // NEVER fail the cancellation. Sent service-role (same pattern as the
    // waitlist notify below) so the restricted "rsvp-cancelled" template is allowed.
    try {
      const { data: cancelEvt } = await adminClient
        .from("events")
        .select("id, title, start_time, end_time")
        .eq("id", event_id)
        .maybeSingle();

      if (cancelEvt && user.email) {
        const origin = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://704collective.com";
        const start = cancelEvt.start_time ? new Date(cancelEvt.start_time) : null;
        const eventDate = start
          ? start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })
          : "";
        const eventTime = start
          ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
          : "";
        const cancelEmailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            to: user.email,
            template: "rsvp-cancelled",
            data: {
              eventName: cancelEvt.title || "your event",
              eventDate,
              eventTime,
              startTimeIso: cancelEvt.start_time,
              endTimeIso: cancelEvt.end_time,
              eventId: cancelEvt.id,
              origin,
            },
          }),
        });
        if (!cancelEmailRes.ok) {
          log("cancellation email send FAILED (non-fatal)", { status: cancelEmailRes.status, body: await cancelEmailRes.text() });
        } else {
          log("cancellation email sent", { to: user.email, event_id: event_id });
        }
      }
    } catch (cancelEmailErr) {
      log("cancellation email error (non-fatal)", String(cancelEmailErr));
    }

    // ── Waitlist auto-notify (additive; NEVER breaks the void) ────────────────
    // A seat may have just freed up. If the event has finite capacity and now
    // has an open seat, offer it to the next eligible waitlister with a timed
    // claim window. Any failure here is swallowed - the RSVP is already voided.
    const CLAIM_WINDOW_HOURS = 24;
    try {
      // 1) Event capacity + display fields. Null capacity => unlimited => no-op.
      const { data: evt } = await adminClient
        .from("events")
        .select("id, title, start_time, capacity")
        .eq("id", event_id)
        .maybeSingle();

      if (evt && evt.capacity != null) {
        // 2) Is a seat truly free? Count active|used credentials.
        const { count: seated } = await adminClient
          .from("attendance_credentials")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event_id)
          .in("status", ["active", "used"]);
        const seatedCount = typeof seated === "number" ? seated : 0;

        if (seatedCount < evt.capacity) {
          // 3) Release stale holds so those seats become claimable by others.
          await adminClient
            .from("event_waitlist")
            .update({ notified_at: null, expires_at: null })
            .eq("event_id", event_id)
            .lt("expires_at", new Date().toISOString());

          // 4) Pick the next un-notified claimant (lowest waitlist position).
          const { data: nextUp } = await adminClient
            .from("event_waitlist")
            .select("id, user_id")
            .eq("event_id", event_id)
            .is("notified_at", null)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (nextUp) {
            // 5) Stamp the claim window on their row.
            const nowIso = new Date().toISOString();
            const expiresIso = new Date(Date.now() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
            await adminClient
              .from("event_waitlist")
              .update({ notified_at: nowIso, expires_at: expiresIso })
              .eq("id", nextUp.id);

            // 6) Email the claimant via send-email (non-critical, like guest-pass).
            try {
              const { data: claimant } = await adminClient
                .from("profiles")
                .select("email, full_name")
                .eq("id", nextUp.user_id)
                .maybeSingle();

              if (claimant?.email) {
                const origin = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://704collective.com";
                const start = evt.start_time ? new Date(evt.start_time) : null;
                const eventDate = start
                  ? start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })
                  : "";
                const eventTime = start
                  ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
                  : "";
                await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({
                    to: claimant.email,
                    template: "waitlist-spot-open",
                    data: {
                      memberName: claimant.full_name || "there",
                      eventTitle: evt.title || "an event",
                      eventDate,
                      eventTime,
                      claimUrl: `${origin}/events/${event_id}?claim=1`,
                      expiresHours: CLAIM_WINDOW_HOURS,
                      origin,
                    },
                  }),
                });
                log("waitlist claimant notified", { waitlistId: nextUp.id, event_id });
              }
            } catch (emailErr) {
              log("waitlist notify email error (non-critical)", String(emailErr));
            }
          }
        }
      }
    } catch (waitlistErr) {
      log("waitlist auto-notify error (non-critical)", String(waitlistErr));
    }
    return new Response(JSON.stringify({ success: true, voided: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VOID-CREDENTIAL] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});