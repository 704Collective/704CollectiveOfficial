// AUTH PATTERN: browser member call. Verifies the caller's user JWT, then
// uses a service-role client for all DB writes. Do NOT apply the cron
// service-role-bearer pattern here.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePerson } from "../_shared/resolvePerson.ts";
import { rsvpNotOpen, rsvpOpensCopy } from "../_shared/rsvpWindow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-MEMBER-RSVP] ${step}${d}`);
};

/** Ad attribution. Strings of 200 chars or fewer only; anything else is dropped
 *  rather than rejected, so a mangled ad URL never costs a member their RSVP. */
function sanitizeUtm(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    const v = src[field];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed && trimmed.length <= 200) out[field] = trimmed;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

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

    // -- Verify active membership --
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      // email, full_name and phone are here for the resolver: people.email is
      // NOT NULL, so a mint needs them.
      .select("id, email, full_name, phone, subscription_status, membership_override, member_type, role")
      .eq("id", memberUserId)
      .is("deleted_at", null)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isActiveMember =
      profile.subscription_status === "active" ||
      profile.subscription_status === "trialing" ||
      profile.membership_override === true;

    if (!isActiveMember) {
      return new Response(JSON.stringify({ error: "Active membership required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Parse body --
    const { event_id, utm } = await req.json() as { event_id?: string; utm?: unknown };
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Resolve the member's canonical people row --
    // Resolver mints-or-heals; a missing people row is a fixable state, not an error.
    const { personId, via, healed } = await resolvePerson(adminClient, {
      authUserId: memberUserId,
      email: profile.email,
      profile,
      source: "create_member_rsvp",
      mint: true,
    });

    if (!personId) {
      log("RESOLVER-NULL: person neither resolved nor minted", { memberUserId });
      return new Response(JSON.stringify({ error: "Could not resolve member record" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log("person resolved", { personId, via, healed });

    // -- Fetch event --
    const { data: event, error: eventError } = await adminClient
      .from("events")
      .select("id, capacity, is_published, required_tier, rsvp_opens_at")
      .eq("id", event_id)
      .maybeSingle();

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!event.is_published) {
      return new Response(JSON.stringify({ error: "Event is not currently available" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdminOverride = profile.role === "admin" || profile.role === "super_admin";

    // -- Opening-time gate: RSVPs have not opened yet (admins exempt, same as
    // capacity, and the credential they insert carries the admin_override stamp
    // the DB backstop honors). Null rsvp_opens_at is always open. --
    if (!isAdminOverride && rsvpNotOpen(event.rsvp_opens_at)) {
      log("rsvp not open yet", { event_id, rsvp_opens_at: event.rsvp_opens_at });
      return new Response(
        JSON.stringify({ error: rsvpOpensCopy(event.rsvp_opens_at as string), rsvp_opens_at: event.rsvp_opens_at }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -- Tier gate: business events admit business members only (admins exempt) --
    // Server-side mirror of the client gate in useTicketActions; closes the
    // mobile-CTA / direct-invoke bypass that let social members RSVP.
    if (event.required_tier === "business" && !isAdminOverride && profile.member_type !== "business") {
      log("tier gate blocked", { memberUserId, event_id, member_type: profile.member_type });
      return new Response(JSON.stringify({ error: "This event is for business members only." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -- Idempotency: existing active member_rsvp credential for this person + event --
    const { data: existingCred } = await adminClient
      .from("attendance_credentials")
      .select("id, token")
      .eq("person_id", personId)
      .eq("event_id", event_id)
      .eq("credential_type", "member_rsvp")
      .eq("status", "active")
      .maybeSingle();

    if (existingCred) {
      log("member_rsvp credential already exists", { personId, event_id });
      return new Response(
        JSON.stringify({ success: true, credential_token: existingCred.token, already_rsvped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -- Capacity check (also enforced atomically by trg_enforce_event_capacity) --
    // Counts active|used credentials. Not atomic here; the DB trigger is the
    // authoritative guard. Admins (admin|super_admin) bypass both layers via
    // the admin_override stamp added to the credential metadata below.
    if (event.capacity != null && !isAdminOverride) {
      const { count: countData, error: countError } = await adminClient
        .from("attendance_credentials")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event_id)
        .in("status", ["active", "used"]);
      if (countError) {
        log("capacity count failed", { error: countError.message });
        return new Response(JSON.stringify({ error: "Could not verify capacity" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const currentCount = typeof countData === "number" ? countData : 0;
      if (currentCount >= event.capacity) {
        log("event at capacity", { event_id, currentCount, capacity: event.capacity });
        return new Response(JSON.stringify({ error: "Event is at capacity" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // -- Generate token and insert the member_rsvp credential --
    const tokenBytes = new Uint8Array(8);
    crypto.getRandomValues(tokenBytes);
    const credToken = "C-" + Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();

    const credMetadata: Record<string, unknown> = { source: "create_member_rsvp" };
    if (isAdminOverride) {
      credMetadata.admin_override = "true";
      credMetadata.issued_via_admin_override = true;
    }
    // Ad attribution, additive and optional: no schema needed, and a member RSVP
    // with nothing to report carries exactly the metadata it always has.
    const cleanUtm = sanitizeUtm(utm);
    if (cleanUtm) credMetadata.utm = cleanUtm;

    const { data: cred, error: credError } = await adminClient
      .from("attendance_credentials")
      .insert({
        token: credToken,
        person_id: personId,
        event_id,
        credential_type: "member_rsvp",
        status: "active",
        metadata: credMetadata,
      })
      .select("token")
      .single();

    if (credError) {
      // 23505 = unique violation (one_active_credential_per_person_per_event).
      // A concurrent RSVP won the race; return the existing credential.
      if ((credError as { code?: string }).code === "23505") {
        const { data: raceCred } = await adminClient
          .from("attendance_credentials")
          .select("token")
          .eq("person_id", personId)
          .eq("event_id", event_id)
          .eq("credential_type", "member_rsvp")
          .eq("status", "active")
          .maybeSingle();
        return new Response(
          JSON.stringify({ success: true, credential_token: raceCred?.token ?? null, already_rsvped: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      log("credential insert failed", { error: credError.message });
      return new Response(JSON.stringify({ error: "Failed to create RSVP" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("member_rsvp credential issued", { personId, event_id, token: credToken });
    return new Response(
      JSON.stringify({ success: true, credential_token: cred.token, already_rsvped: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CREATE-MEMBER-RSVP] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
