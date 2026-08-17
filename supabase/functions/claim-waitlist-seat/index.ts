// AUTH PATTERN: browser member call. Verifies the caller's user JWT, then
// uses a service-role client for the DB write. Copied from void-credential /
// create-member-rsvp. Do NOT apply the cron service-role-bearer pattern here.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePerson } from "../_shared/resolvePerson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CLAIM-WAITLIST-SEAT] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // -- Auth: verify the caller's user JWT --
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memberUserId = user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // -- Parse body --
    const { event_id } = await req.json() as { event_id?: string };
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- CHECK 1: caller must be on the waitlist for this event --
    const { data: wlRow, error: wlError } = await adminClient
      .from("event_waitlist")
      .select("id, notified_at, expires_at")
      .eq("event_id", event_id)
      .eq("user_id", memberUserId)
      .maybeSingle();

    if (wlError) {
      log("waitlist lookup failed", { error: wlError.message });
      return new Response(JSON.stringify({ error: "Could not look up waitlist" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!wlRow) {
      return new Response(JSON.stringify({ error: "You're not on the waitlist for this event." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- CHECK 2: an active claim window must be open (notified + not expired) --
    const windowOpen =
      wlRow.notified_at != null &&
      wlRow.expires_at != null &&
      new Date(wlRow.expires_at).getTime() > Date.now();
    if (!windowOpen) {
      return new Response(JSON.stringify({ error: "Your claim window isn't open, or it has expired." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- CHECK 3: active membership (mirrors create-member-rsvp) --
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      // email, full_name and phone are here for the resolver: people.email is
      // NOT NULL, so a mint needs them. member_type sets the minted tier.
      .select("id, email, full_name, phone, member_type, subscription_status, membership_override, role")
      .eq("id", memberUserId)
      .is("deleted_at", null)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = profile.role === "admin" || profile.role === "super_admin";
    const isActiveMember =
      profile.subscription_status === "active" ||
      profile.subscription_status === "trialing" ||
      profile.membership_override === true ||
      isAdmin;

    if (!isActiveMember) {
      return new Response(JSON.stringify({ error: "Active membership required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Resolve the member's canonical people row (needed for the credential).
    // Listed as check 5 in the spec; performed here because check 4 depends on it.
    // Resolver mints-or-heals: an active member holding an open claim window must
    // never lose their seat to a missing people row.
    const { personId, via, healed } = await resolvePerson(adminClient, {
      authUserId: memberUserId,
      email: profile.email,
      profile,
      source: "claim_waitlist_seat",
      mint: true,
    });

    if (!personId) {
      log("RESOLVER-NULL: person neither resolved nor minted", { memberUserId });
      return new Response(JSON.stringify({ error: "Member record not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("person resolved", { personId, via, healed });

    // -- CHECK 4: they must not already hold an active|used member_rsvp credential --
    const { data: existingCred } = await adminClient
      .from("attendance_credentials")
      .select("id")
      .eq("person_id", personId)
      .eq("event_id", event_id)
      .eq("credential_type", "member_rsvp")
      .in("status", ["active", "used"])
      .maybeSingle();

    if (existingCred) {
      return new Response(JSON.stringify({ error: "You've already RSVP'd for this event." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Insert the member_rsvp credential. The DB capacity trigger
    // (trg_enforce_event_capacity) is the authoritative race backstop:
    // if the seat was taken between our free-seat check and this insert,
    // it raises EVENT_AT_CAPACITY (P0001). --
    const tokenBytes = new Uint8Array(8);
    crypto.getRandomValues(tokenBytes);
    const credToken = "C-" + Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();

    const { data: cred, error: credError } = await adminClient
      .from("attendance_credentials")
      .insert({
        token: credToken,
        person_id: personId,
        event_id,
        credential_type: "member_rsvp",
        status: "active",
        metadata: { source: "waitlist_claim" },
      })
      .select("token")
      .single();

    if (credError) {
      const code = (credError as { code?: string }).code;
      const message = credError.message || "";

      // Race lost: seat filled by the DB trigger. Keep their waitlist place,
      // just release the (now-consumed) hold so they're eligible next opening.
      if (code === "P0001" || message.includes("EVENT_AT_CAPACITY")) {
        await adminClient
          .from("event_waitlist")
          .update({ notified_at: null, expires_at: null })
          .eq("id", wlRow.id);
        log("claim lost to capacity race", { personId, event_id });
        return new Response(JSON.stringify({ error: "That seat was just taken. You've kept your place on the waitlist." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Unique violation: a concurrent RSVP already seated them. Treat as done -
      // drop the waitlist row and report success (idempotent).
      if (code === "23505") {
        await adminClient.from("event_waitlist").delete().eq("id", wlRow.id);
        const { data: raceCred } = await adminClient
          .from("attendance_credentials")
          .select("token")
          .eq("person_id", personId)
          .eq("event_id", event_id)
          .eq("credential_type", "member_rsvp")
          .in("status", ["active", "used"])
          .maybeSingle();
        return new Response(
          JSON.stringify({ success: true, credential_token: raceCred?.token ?? null, already_rsvped: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      log("credential insert failed", { error: message });
      return new Response(JSON.stringify({ error: "Failed to claim the spot" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Success: they're seated. Remove their waitlist row. --
    await adminClient.from("event_waitlist").delete().eq("id", wlRow.id);

    log("waitlist seat claimed", { personId, event_id, token: credToken });
    return new Response(
      JSON.stringify({ success: true, credential_token: cred.token }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CLAIM-WAITLIST-SEAT] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
