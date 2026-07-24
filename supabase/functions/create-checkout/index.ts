import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function checkRateLimit(supabase: any, key: string, max: number): Promise<boolean> {
  // rate_limits schema: (key text, count int, window_start timestamptz).
  // Select newest row for the key so duplicate rows never break the limiter.
  // Any DB error is logged and fails open (never throws, never blocks).
  const now = new Date();
  const { data: rows, error: selErr } = await supabase
    .from("rate_limits")
    .select("id, count, window_start")
    .eq("key", key)
    .order("window_start", { ascending: false })
    .limit(1);
  if (selErr) {
    console.error("RATE_LIMIT_DB_ERROR [create-checkout] select", selErr);
    return false;
  }

  const row = rows && rows.length > 0 ? rows[0] : null;
  if (row) {
    const withinWindow = now.getTime() - new Date(row.window_start).getTime() < RATE_LIMIT_WINDOW_MS;
    if (withinWindow) {
      if (row.count >= max) {
        return true;
      }
      const { error: updErr } = await supabase.from("rate_limits").update({ count: row.count + 1 }).eq("id", row.id);
      if (updErr) { console.error("RATE_LIMIT_DB_ERROR [create-checkout] update", updErr); return false; }
    } else {
      const { error: resetErr } = await supabase.from("rate_limits").update({ count: 1, window_start: now.toISOString() }).eq("id", row.id);
      if (resetErr) { console.error("RATE_LIMIT_DB_ERROR [create-checkout] reset", resetErr); return false; }
    }
  } else {
    const { error: insErr } = await supabase.from("rate_limits").insert({ key, count: 1, window_start: now.toISOString() });
    if (insErr) { console.error("RATE_LIMIT_DB_ERROR [create-checkout] insert", insErr); return false; }
  }
  return false;
}

// Social membership price IDs — both set in Supabase secrets.
// SOCIAL_REGULAR is the standard $49/mo price.
// SOCIAL_AMBASSADOR is the locked-in ambassador rate; referred members keep
// their price regardless of future catalog price changes.
const SOCIAL_REGULAR = Deno.env.get("STRIPE_SOCIAL_PRICE_ID") ?? "";
const SOCIAL_AMBASSADOR = Deno.env.get("STRIPE_AMBASSADOR_SOCIAL_PRICE_ID") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // ── Rate limiting (10 checkouts per IP per hour) ──
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimitSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    const rateLimitKey = `checkout:${clientIp}`;
    const isRateLimited = await checkRateLimit(rateLimitSupabase, rateLimitKey, RATE_LIMIT_MAX);
    if (isRateLimited) {
      logStep("Rate limited", { ip: clientIp });
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Parse request body (all fields optional for guest checkout)
    const body = await req.json().catch(() => ({}));
    const guestEmail = body.email;
    const guestName = body.name;
    const smsConsent = body.sms_consent === true;
    const smsConsentAt = smsConsent ? new Date().toISOString() : "";
    const rawReferralCode: string | null = typeof body.referral_code === "string" ? body.referral_code : null;
    const rawAmbassadorId: string | null = typeof body.ambassador_id === "string" ? body.ambassador_id : null;

    // ── Server-side ambassador re-validation ───────────────────────────
    // The /join form already validated, but we re-verify here so a tampered
    // request body can't grant locked-in pricing without an active code.
    let validatedAmbassadorId: string | null = null;
    let validatedReferralCode: string | null = null;
    if (rawAmbassadorId && rawReferralCode) {
      const { data: ambData } = await rateLimitSupabase
        .from("ambassadors")
        .select("id, referral_code, is_active")
        .eq("id", rawAmbassadorId)
        .eq("is_active", true)
        .maybeSingle();
      if (ambData && ambData.referral_code.toLowerCase() === rawReferralCode.toLowerCase()) {
        validatedAmbassadorId = ambData.id;
        validatedReferralCode = ambData.referral_code;
        logStep("Ambassador validated", { ambassador_id: validatedAmbassadorId, code: validatedReferralCode });
      } else {
        logStep("Ambassador validation failed - falling back to standard price", {
          provided_id: rawAmbassadorId,
          provided_code: rawReferralCode,
        });
      }
    }

    // Pick the price ID: ambassador-locked when validated, regular otherwise.
    const priceIdToUse = validatedAmbassadorId ? SOCIAL_AMBASSADOR : SOCIAL_REGULAR;
    if (!priceIdToUse) {
      throw new Error(
        validatedAmbassadorId
          ? "STRIPE_AMBASSADOR_SOCIAL_PRICE_ID is not set"
          : "STRIPE_SOCIAL_PRICE_ID is not set"
      );
    }

    // --- Auth: getClaims (optional — supports guest checkout) ---
    let userEmail: string | undefined;
    let userId: string | undefined;

    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        }
      );

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

      if (!claimsError && claimsData?.claims) {
        userId = claimsData.claims.sub as string;
        userEmail = claimsData.claims.email as string;
        logStep("User authenticated", { userId, email: userEmail });
      } else {
        logStep("Auth token invalid or expired, proceeding as guest", {
          error: claimsError?.message,
        });
      }
    }

    // Use guest email if provided, otherwise leave undefined (Stripe will collect)
    const checkoutEmail = userEmail || guestEmail;
    logStep("Checkout email", { email: checkoutEmail || "Stripe will collect" });

    // --- Stripe customer: profile-first lookup (only for authenticated users) ---
    let customerId: string | undefined;

    if (userId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .is("deleted_at", null)
        .maybeSingle();

      if (profile?.stripe_customer_id) {
        customerId = profile.stripe_customer_id;
        logStep("Using stored Stripe customer", { customerId });
      }
    }

    // Fall back to email lookup if no stored ID
    if (!customerId && checkoutEmail) {
      const customers = await stripe.customers.list({ email: checkoutEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer by email", { customerId });
      }
    }

    const origin = req.headers.get("origin") || "https://704collective.com";

    // Route authenticated users to dashboard, guests to setup-password
    const successUrl = userId
      ? `${origin}/dashboard?welcome=true`
      : `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    logStep("Success URL determined", { authenticated: !!userId, successUrl });

    // Create checkout session for subscription
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      allow_promotion_codes: true,
      customer: customerId,
      customer_email: customerId ? undefined : checkoutEmail || undefined,
      line_items: [
        {
          price: priceIdToUse,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: `${origin}/join`,
      metadata: {
        user_id: userId || "",
        guest_name: guestName || "",
        origin: origin,
        sms_consent: String(smsConsent),
        sms_consent_at: smsConsentAt,
        ambassador_id: validatedAmbassadorId ?? "",
        referral_code: validatedReferralCode ?? "",
        ambassador_tier: validatedAmbassadorId ? "social" : "",
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-checkout", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
