import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-CHECKOUT-SESSION] ${step}${d}`);
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
    console.error("RATE_LIMIT_DB_ERROR [verify-checkout-session] select", selErr);
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
      if (updErr) { console.error("RATE_LIMIT_DB_ERROR [verify-checkout-session] update", updErr); return false; }
    } else {
      const { error: resetErr } = await supabase.from("rate_limits").update({ count: 1, window_start: now.toISOString() }).eq("id", row.id);
      if (resetErr) { console.error("RATE_LIMIT_DB_ERROR [verify-checkout-session] reset", resetErr); return false; }
    }
  } else {
    const { error: insErr } = await supabase.from("rate_limits").insert({ key, count: 1, window_start: now.toISOString() });
    if (insErr) { console.error("RATE_LIMIT_DB_ERROR [verify-checkout-session] insert", insErr); return false; }
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();

    if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      return new Response(
        JSON.stringify({ error: "Invalid session ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Rate limiting (10 requests per session_id per hour) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const rateLimitKey = `verify-session:${session_id}`;
    const isRateLimited = await checkRateLimit(supabase, rateLimitKey, RATE_LIMIT_MAX);
    if (isRateLimited) {
      log("Rate limited", { session_id });
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    log("Retrieving session", { session_id });
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      log("Payment not completed", { status: session.payment_status });
      return new Response(
        JSON.stringify({ error: "Payment not completed", paid: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check session age — reject if older than 60 minutes
    const SESSION_MAX_AGE_MS = 60 * 60 * 1000;
    const sessionCreatedAt = session.created * 1000;
    if (Date.now() - sessionCreatedAt > SESSION_MAX_AGE_MS) {
      log("Session expired", { created: session.created, ageMinutes: Math.round((Date.now() - sessionCreatedAt) / 60000) });
      return new Response(
        JSON.stringify({ error: "This link has expired", paid: false }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = {
      paid: true,
      name: session.customer_details?.name || "",
      email: session.customer_details?.email || "",
      phone: session.customer_details?.phone || "",
    };

    log("Session verified", { email: result.email });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });

    // Stripe throws for invalid session IDs
    const isInvalidSession = message.includes("No such checkout.session");
    return new Response(
      JSON.stringify({ error: isInvalidSession ? "Invalid or expired session" : message }),
      {
        status: isInvalidSession ? 404 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
