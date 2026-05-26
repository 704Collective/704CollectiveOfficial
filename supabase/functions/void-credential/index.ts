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