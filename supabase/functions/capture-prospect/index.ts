import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      email,
      full_name,
      phone,
      sms_consent,
      referral_code,
      user_id,
      primary_goal,
      sms_consent_at,
      ambassador_id,
    } = body as {
      email?: string;
      full_name?: string;
      phone?: string;
      sms_consent?: boolean;
      referral_code?: string | null;
      user_id?: string;
      primary_goal?: string;
      sms_consent_at?: string | null;
      ambassador_id?: string;
    };

    // 1. Validate email
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const consentTrue = sms_consent === true;

    // Tag the prospect with their referral source. This is informational only -
    // the canonical ambassador_referrals row is created later by stripe-webhook
    // after payment completes successfully.
    const cleanCode = (referral_code ?? "").trim().toUpperCase();
    const sourceValue = cleanCode ? `ambassador_referral:${cleanCode}` : "join_page";

    // 2. Contacts upsert
    const { data: contact, error: upsertError } = await supabase
      .from("contacts")
      .upsert(
        {
          email: email.toLowerCase().trim(),
          full_name: full_name ?? null,
          phone: phone ?? null,
          source: sourceValue,
          source_detail: "pre_checkout_capture",
          status: "active",
          sms_consent: consentTrue,
          sms_consent_at: consentTrue ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email", ignoreDuplicates: false }
      )
      .select("id")
      .maybeSingle();

    if (upsertError) {
      console.error("[capture-prospect] upsert error:", upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Contact tags
    if (contact?.id) {
      const { error: tagError } = await supabase
        .from("contact_tags")
        .upsert(
          { contact_id: contact.id, tag: "prospect" },
          { onConflict: "contact_id,tag", ignoreDuplicates: true }
        );
      if (tagError) {
        console.error("[capture-prospect] tag error:", tagError);
      }
    }

    // 4 + 5. Profile and onboarding writes - only when user_id is provided AND
    // a real profiles row exists (signUp decoy ids and races otherwise FK-explode).
    // These writes are NON-FATAL: never block the checkout path over them.
    if (user_id) {
      const { data: profileRow, error: profileLookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user_id)
        .maybeSingle();
      if (profileLookupError) {
        console.error("[capture-prospect] profile lookup error (non-fatal):", profileLookupError);
      }
      if (profileRow) {
        // 4. Update profiles
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            phone: phone ?? null,
            sms_consent: consentTrue,
            sms_consent_at: consentTrue ? (sms_consent_at ?? new Date().toISOString()) : null,
            referred_by_code: cleanCode || null,
            referred_by_ambassador_id: (ambassador_id && ambassador_id.trim() !== "") ? ambassador_id.trim() : null,
          })
          .eq("id", user_id);
        if (profileError) {
          console.error("[capture-prospect] profiles update error (non-fatal):", profileError);
        }
        // 5. Insert onboarding_responses
        if (primary_goal && primary_goal.trim() !== "") {
          const { error: onboardingError } = await supabase
            .from("onboarding_responses")
            .upsert(
              {
                user_id,
                responses: { primary_goal: primary_goal.trim() },
                version: 1,
                completed_at: new Date().toISOString(),
              },
              { onConflict: "user_id,version", ignoreDuplicates: true }
            );
          if (onboardingError) {
            console.error("[capture-prospect] onboarding_responses insert error (non-fatal):", onboardingError);
          }
        }
      } else {
        console.error("[capture-prospect] no profiles row for user_id (skipping profile/onboarding writes):", user_id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[capture-prospect] unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});