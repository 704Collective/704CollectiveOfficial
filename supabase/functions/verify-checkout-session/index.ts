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
    await supabase.from("rate_limits").upsert({ key, attempts: 1, window_start: now.toISOString() }, { onConflict: "key" });
    return false;
  }

  if (data.attempts >= max) {
    return true;
  }

  await supabase.from("rate_limits").update({ attempts: data.attempts + 1 }).eq("key", key);
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
