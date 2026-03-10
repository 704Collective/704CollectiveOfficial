import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SET-INITIAL-PASSWORD] ${step}${d}`);
};

const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function checkRateLimit(supabase: any, key: string, max: number): Promise<boolean> {
  const { data } = await supabase
    .from("rate_limits")
    .select("attempts, window_start")
    .eq("key", key)
    .maybeSingle();

  const now = new Date();
  if (!data) {
    await supabase.from("rate_limits").upsert({ key, attempts: 1, window_start: now.toISOString() }, { onConflict: "key" });
    return false;
  }

  const windowStart = new Date(data.window_start);
  if (now.getTime() - windowStart.getTime() > RATE_LIMIT_WINDOW_MS) {
    // Window expired, reset
    await supabase.from("rate_limits").upsert({ key, attempts: 1, window_start: now.toISOString() }, { onConflict: "key" });
    return false;
  }

  if (data.attempts >= max) {
    return true; // Rate limited
  }

  await supabase.from("rate_limits").update({ attempts: data.attempts + 1 }).eq("key", key);
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, session_id } = await req.json();

    // ── Input validation ──
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      log("Missing or invalid session_id");
      return new Response(
        JSON.stringify({ error: "Valid checkout session ID is required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Rate limiting (5 attempts per email per hour) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const rateLimitKey = `set-password:${email.toLowerCase()}`;
    const isRateLimited = await checkRateLimit(supabase, rateLimitKey, RATE_LIMIT_MAX);
    if (isRateLimited) {
      log("Rate limited", { email });
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verify Stripe checkout session ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    log("Verifying checkout session", { session_id });
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(session_id);
    } catch (stripeErr) {
      log("Stripe session retrieval failed", { error: String(stripeErr) });
      return new Response(
        JSON.stringify({ error: "Invalid or expired checkout session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check payment status
    if (session.payment_status !== "paid") {
      log("Session not paid", { status: session.payment_status });
      return new Response(
        JSON.stringify({ error: "Checkout session has not been paid" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check email matches
    const sessionEmail = session.customer_details?.email?.toLowerCase();
    if (!sessionEmail || sessionEmail !== email.toLowerCase()) {
      log("Email mismatch", { provided: email, session: sessionEmail });
      return new Response(
        JSON.stringify({ error: "Email does not match checkout session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check session age (created within last 60 minutes)
    const sessionCreatedAt = session.created * 1000; // Stripe uses seconds
    if (Date.now() - sessionCreatedAt > SESSION_MAX_AGE_MS) {
      log("Session too old", { created: session.created, ageMinutes: Math.round((Date.now() - sessionCreatedAt) / 60000) });
      return new Response(
        JSON.stringify({ error: "Checkout session has expired. Please contact support." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Stripe session verified", { email: sessionEmail });

    // ── Look up user by email (reusing supabase client from above) ──

    log("Looking up user", { email });
    const { data: userData, error: lookupErr } = await supabase.auth.admin.getUserByEmail(email);

    if (lookupErr || !userData?.user) {
      log("User not found", { email, error: lookupErr?.message });
      return new Response(
        JSON.stringify({ error: "account_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = userData.user;

    // ── Safety check: only allow for users who have NEVER signed in ──
    if (user.last_sign_in_at) {
      log("User has already signed in — rejecting", { userId: user.id, lastSignIn: user.last_sign_in_at });
      return new Response(
        JSON.stringify({ error: "already_setup" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Set the password ──
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (updateErr) {
      log("Failed to set password", { error: updateErr.message });
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Password set successfully", { userId: user.id });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
