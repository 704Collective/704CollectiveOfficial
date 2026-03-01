import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PAUSE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // --- Auth: getClaims (JWT-only, no network round-trip) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;
    if (!userId || !userEmail) {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    logStep("User authenticated", { userId, email: userEmail });

    // Parse the pause duration from the request body
    const { months } = await req.json();
    const pauseMonths = parseInt(months) || 1;
    if (pauseMonths < 1 || pauseMonths > 3) {
      throw new Error("Pause duration must be between 1 and 3 months");
    }
    logStep("Pause duration", { months: pauseMonths });

    // --- Service-role client for DB operations ---
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // --- Stripe customer: profile-first lookup ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    let customerId: string | null = profile?.stripe_customer_id ?? null;

    if (customerId) {
      logStep("Using stored Stripe customer", { customerId });
    } else {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found Stripe customer by email fallback", { customerId });
        // Persist for future lookups
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("id", userId);
      }
    }

    if (!customerId) {
      throw new Error("No Stripe customer found for this user.");
    }

    // Find the active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found to pause.");
    }

    const subscription = subscriptions.data[0];
    logStep("Found active subscription", { subscriptionId: subscription.id });

    // Calculate the resume date
    const resumesAt = new Date();
    resumesAt.setMonth(resumesAt.getMonth() + pauseMonths);
    const resumesAtUnix = Math.floor(resumesAt.getTime() / 1000);

    // Pause payment collection
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.id,
      {
        pause_collection: {
          behavior: "void",
          resumes_at: resumesAtUnix,
        },
      }
    );

    const pauseUntil = resumesAt.toISOString();
    logStep("Subscription paused", { subscriptionId: subscription.id, pauseUntil });

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "paused",
        subscription_paused_until: pauseUntil,
      })
      .eq("id", userId);

    if (updateError) {
      logStep("WARNING: Failed to update profile", { error: updateError.message });
    } else {
      logStep("Profile updated successfully");
    }

    return new Response(
      JSON.stringify({
        success: true,
        paused_until: pauseUntil,
        message: `Membership paused until ${pauseUntil}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in pause-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
