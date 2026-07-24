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
    console.error("RATE_LIMIT_DB_ERROR [set-initial-password] select", selErr);
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
      if (updErr) { console.error("RATE_LIMIT_DB_ERROR [set-initial-password] update", updErr); return false; }
    } else {
      const { error: resetErr } = await supabase.from("rate_limits").update({ count: 1, window_start: now.toISOString() }).eq("id", row.id);
      if (resetErr) { console.error("RATE_LIMIT_DB_ERROR [set-initial-password] reset", resetErr); return false; }
    }
  } else {
    const { error: insErr } = await supabase.from("rate_limits").insert({ key, count: 1, window_start: now.toISOString() });
    if (insErr) { console.error("RATE_LIMIT_DB_ERROR [set-initial-password] insert", insErr); return false; }
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      email,
      password,
      session_id,
      first_name,
      last_name,
      phone,
      company,
      title,
    } = await req.json();

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

    if (!first_name || !last_name) {
      return new Response(
        JSON.stringify({ error: "First name and last name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Rate limiting ──
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

    if (session.payment_status !== "paid") {
      log("Session not paid", { status: session.payment_status });
      return new Response(
        JSON.stringify({ error: "Checkout session has not been paid" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionEmail = session.customer_details?.email?.toLowerCase();
    if (!sessionEmail || sessionEmail !== email.toLowerCase()) {
      log("Email mismatch", { provided: email, session: sessionEmail });
      return new Response(
        JSON.stringify({ error: "Email does not match checkout session" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionCreatedAt = session.created * 1000;
    if (Date.now() - sessionCreatedAt > SESSION_MAX_AGE_MS) {
      log("Session too old", { ageMinutes: Math.round((Date.now() - sessionCreatedAt) / 60000) });
      return new Response(
        JSON.stringify({ error: "Checkout session has expired. Please contact support." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log("Stripe session verified", { email: sessionEmail });

    // ── Look up user by email ──
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

    // ── Safety check: only allow for users who have never signed in ──
    if (user.last_sign_in_at) {
      log("User has already signed in - rejecting", { userId: user.id });
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

    // ── Update profile with all additional fields ──
    const fullName = `${first_name.trim()} ${last_name.trim()}`;
    const profileUpdate: Record<string, unknown> = {
      full_name: fullName,
      phone: phone.trim(),
    };
    if (company?.trim()) profileUpdate.company = company.trim();
    if (title?.trim()) profileUpdate.title = title.trim();

    const { error: profileErr } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);

    if (profileErr) {
      log("Profile update failed (non-blocking)", { error: profileErr.message });
    } else {
      log("Profile updated", { userId: user.id, fields: Object.keys(profileUpdate) });
    }

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