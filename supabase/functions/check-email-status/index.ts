import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { emailCheckStatus } from "../_shared/emailCheckStatus.ts";
import { parseCheckEmailStatusBody } from "../_shared/parseCheckEmailStatusBody.ts";
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
    const parsed = parseCheckEmailStatusBody(await req.text());
    if (!parsed.ok) {
      return new Response(
        JSON.stringify({ error: parsed.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const rawEmail = parsed.email;

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

    // Membership is the profile rule shared with RSVP and calendar-feed.
    // people.override_paying is a stale import flag and is not consulted.
    // ilike with no wildcards = case-insensitive exact match. limit(1) keeps
    // maybeSingle() safe even if legacy duplicate rows exist.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, subscription_status, subscription_ends_at, membership_override, deleted_at")
      .ilike("email", emailLower)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    // People only distinguishes existing_contact from new. Email-only and
    // mint:false: this is a pre-signup lookup and must never create a row.
    const { personId } = await resolvePerson(supabaseAdmin, {
      email: emailLower,
      source: "check_email_status",
      mint: false,
    });

    const { data: person } = personId
      ? await supabaseAdmin
          .from("people")
          .select("id")
          .eq("id", personId)
          .maybeSingle()
      : { data: null };

    const status = emailCheckStatus({
      profile,
      hasPerson: !!person,
    });

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