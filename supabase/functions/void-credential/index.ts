// AUTH PATTERN: browser member call. Verifies the caller's user JWT, then
// uses a service-role client for the DB write. Do NOT apply the cron
// service-role-bearer pattern here.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePerson } from "../_shared/resolvePerson.ts";
import { cascadeEnvFromDeno, releaseWaitlistSeat, voidLinkedPlusOnes } from "../_shared/credentialCascade.ts";

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

    // The resolver takes the profile so an email hit can heal and promote in
    // passing. A missing profile is not fatal here: the JWT email still resolves,
    // and this function never mints.
    const profileResult = await adminClient
      .from("profiles")
      .select("id, email, full_name, phone, subscription_status, membership_override, member_type")
      .eq("id", memberUserId)
      .is("deleted_at", null)
      .maybeSingle();
    const profile = profileResult.data;

    // mint:false on purpose. No person row means no credential to void, which is
    // the existing not-found response, unchanged.
    const { personId, via, healed } = await resolvePerson(adminClient, {
      authUserId: memberUserId,
      email: profile?.email ?? user.email ?? undefined,
      profile: profile ?? undefined,
      source: "void_credential",
      mint: false,
    });

    if (!personId) {
      log("person row not found", { memberUserId });
      return new Response(JSON.stringify({ error: "Member record not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("person resolved", { personId, via, healed });

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

    // ── Business +1 cascade ───────────────────────────────────────────────────
    // Shared with cancel-subscription / stripe-webhook (_shared/credentialCascade.ts):
    // a standing +1 hangs off this RSVP via metadata.member_credential_id; the
    // member leaving means the guest leaves too. Removing the +1 alone never
    // touches the member's RSVP (add-business-plus-one action='remove'). Non-fatal.
    await voidLinkedPlusOnes(adminClient, { eventId: event_id, memberCredentialId: credResult.data.id });

    // ── Cancellation confirmation email to the cancelling member ──────────────
    // Fires on every successful self-void, independent of capacity/waitlist.
    // Non-fatal: the void has already succeeded above; a send failure must
    // NEVER fail the cancellation. Sent service-role (same pattern as the
    // waitlist notify below) so the restricted "rsvp-cancelled" template is allowed.
    try {
      const { data: cancelEvt } = await adminClient
        .from("events")
        .select("id, title, start_time, end_time, ics_sequence")
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
              icsSequence: cancelEvt.ics_sequence ?? 0,
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
    // A seat may have just freed up. Shared implementation (same steps, same
    // 24h claim window, same waitlist-spot-open email) in _shared/credentialCascade.ts;
    // it swallows every failure - the RSVP is already voided.
    await releaseWaitlistSeat(adminClient, cascadeEnvFromDeno(), event_id);
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