import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Ad attribution (same rules as exchange-intake-submit): strings ≤200 chars,
 *  anything else stripped rather than rejected. Returns null when empty. */
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
  return Object.keys(out).length ? out : null;
}

const HEARD_ABOUT = new Set([
  "instagram", "tiktok", "facebook", "friend", "event", "cltbucketlist", "google", "other",
]);

function cleanHeard(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  return HEARD_ABOUT.has(t) ? t : null;
}

function cleanOther(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 80);
  return t || null;
}

function cleanPromo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!t || t.length > 40 || !/^[A-Z0-9]+$/.test(t)) return null;
  return t;
}

function sanitizeTouch(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "landing_path", "referrer", "captured_at"]) {
    const v = src[field];
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed || trimmed.length > 200) continue;
    if (field === "referrer" && /[\/\s]/.test(trimmed)) continue;
    out[field] = trimmed;
  }
  const tagged = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].some((f) => out[f]);
  return tagged ? out : null;
}

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
      utm,
      heard_about,
      heard_about_other,
      promo_code,
      first_touch,
      latest_touch,
      capture_context,
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
      utm?: unknown;
      heard_about?: unknown;
      heard_about_other?: unknown;
      promo_code?: unknown;
      first_touch?: unknown;
      latest_touch?: unknown;
      capture_context?: unknown;
    };
    // Only present when the visitor arrived on a tagged URL; never overwrites
    // existing utm_* columns with nulls.
    const utmCols = sanitizeUtm(utm);

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
    const fromSignup = capture_context === "signup";
    const sourceValue = cleanCode
      ? `ambassador_referral:${cleanCode}`
      : fromSignup
        ? "signup"
        : "join_page";
    const sourceDetail = fromSignup ? "account_signup" : "pre_checkout_capture";

    // 2. Contacts upsert
    const { data: contact, error: upsertError } = await supabase
      .from("contacts")
      .upsert(
        {
          email: email.toLowerCase().trim(),
          full_name: full_name ?? null,
          phone: phone ?? null,
          source: sourceValue,
          source_detail: sourceDetail,
          status: "active",
          sms_consent: consentTrue,
          sms_consent_at: consentTrue ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
          ...(utmCols ?? {}),
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

        // Source row. Same profile lookup as above: user_id must already be a
        // profiles.id, and the email on that row must match the body. Non-fatal.
        const emailLower = email.toLowerCase().trim();
        const { data: sourceProfile, error: sourceLookupError } = await supabase
          .from("profiles")
          .select("id, email")
          .eq("id", user_id)
          .maybeSingle();
        if (sourceLookupError) {
          console.error("[capture-prospect] member_sources lookup error (non-fatal):", sourceLookupError);
        } else if (sourceProfile && (sourceProfile.email ?? "").toLowerCase() === emailLower) {
          const heard = cleanHeard(heard_about);
          const other = heard === "other" ? cleanOther(heard_about_other) : null;
          const promo = cleanPromo(promo_code);
          const firstTouch = sanitizeTouch(first_touch);
          const latestTouch = sanitizeTouch(latest_touch);
          if ((heard && (heard !== "other" || other)) || promo || firstTouch || latestTouch) {
            const { data: existingSource } = await supabase
              .from("member_sources")
              .select("first_touch")
              .eq("profile_id", sourceProfile.id)
              .maybeSingle();
            const sourceRow: Record<string, unknown> = {
              profile_id: sourceProfile.id,
              email_lower: emailLower,
              first_touch: existingSource?.first_touch ?? firstTouch,
              latest_touch: latestTouch ?? firstTouch,
            };
            if (heard && (heard !== "other" || other)) {
              sourceRow.heard_about = heard;
              sourceRow.heard_about_other = heard === "other" ? other : null;
            }
            if (promo) sourceRow.promo_code = promo;
            const { error: sourceError } = await supabase
              .from("member_sources")
              .upsert(sourceRow, { onConflict: "profile_id" });
            if (sourceError) {
              console.error("[capture-prospect] member_sources upsert error (non-fatal):", sourceError);
            }
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