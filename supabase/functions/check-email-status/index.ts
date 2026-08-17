import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolvePerson } from "../_shared/resolvePerson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-EMAIL-STATUS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawEmail = (body?.email ?? "").toString().trim();
    if (!rawEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required field: email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailLower = rawEmail.toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLower)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // profiles is authoritative for active-member subscription status.
    // ilike with no wildcards = case-insensitive exact match. limit(1) keeps
    // maybeSingle() safe even if legacy duplicate rows exist.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, subscription_status, membership_override, deleted_at")
      .ilike("email", emailLower)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    const profileActiveMember =
      !!profile &&
      (profile.subscription_status === "active" ||
        profile.subscription_status === "trialing" ||
        profile.membership_override === true);

    // people is the canonical record + a backstop member signal. Biasing
    // toward "treat as member" is the safe failure mode: worst case a real
    // member is told to log in (recoverable), vs. a member being charged.
    //
    // Resolution goes through the shared resolver so this door agrees with
    // every other one about who a person is. Email-only and mint:false: this
    // is a pre-signup lookup and must never create or touch a row. The member
    // signal still comes from the row itself, read back by the resolved id.
    const { personId } = await resolvePerson(supabaseAdmin, {
      email: emailLower,
      source: "check_email_status",
      mint: false,
    });

    const { data: person } = personId
      ? await supabaseAdmin
          .from("people")
          .select("id, member_status, override_paying")
          .eq("id", personId)
          .maybeSingle()
      : { data: null };

    const peopleActiveMember =
      !!person &&
      (person.member_status === "active" || person.override_paying === true);

    const isActiveMember = profileActiveMember || peopleActiveMember;
    const existsSomewhere = !!profile || !!person;

    let status: "active_member" | "existing_contact" | "new";
    if (isActiveMember) {
      status = "active_member";
    } else if (existsSomewhere) {
      status = "existing_contact";
    } else {
      status = "new";
    }

    logStep("Resolved", { status, hasProfile: !!profile, hasPerson: !!person });

    return new Response(
      JSON.stringify({ status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});