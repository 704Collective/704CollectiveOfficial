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
  console.log(`[CANCEL-SUBSCRIPTION] ${step}${detailsStr}`);
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

    // Find ALL subscriptions for this customer — no status filter, no limit:1.
    const allSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const LIVE_END_AT_PERIOD = ["active", "trialing"];
    const LIVE_CANCEL_NOW = ["past_due", "unpaid", "paused", "incomplete"];
    const liveAtPeriodEnd = allSubs.data.filter((s) => LIVE_END_AT_PERIOD.includes(s.status));
    const liveCancelNow = allSubs.data.filter((s) => LIVE_CANCEL_NOW.includes(s.status));
    const liveCount = liveAtPeriodEnd.length + liveCancelNow.length;
    logStep("Subscription inventory", {
      total: allSubs.data.length,
      liveCount,
      statuses: allSubs.data.map((s) => `${s.id}:${s.status}`),
    });

    if (liveCount > 1) {
      console.error(
        `[CANCEL-SUBSCRIPTION] ANOMALY: multiple live subscriptions for customer ${customerId} (user ${userId}) — possible double-billing. Cancelling all.`
      );
    }

    if (liveCount === 0) {
      logStep("No live subscription in Stripe - syncing profile state");
      const { data: currentProfile } = await supabaseAdmin
        .from("profiles")
        .select("subscription_status, subscription_ends_at, cancel_at_period_end")
        .eq("id", userId)
        .maybeSingle();

      // Idempotent: profile already marked canceled -> just confirm.
      if (currentProfile?.subscription_status === "canceled" || currentProfile?.cancel_at_period_end) {
        return new Response(
          JSON.stringify({
            success: true,
            already_canceled: true,
            ends_at: currentProfile?.subscription_ends_at ?? null,
            message: currentProfile?.subscription_ends_at
              ? `Your membership is already canceled. You retain access until ${new Date(currentProfile.subscription_ends_at).toLocaleDateString()}.`
              : "Your membership is already canceled.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // Stripe has NOTHING live for this customer (out-of-band cancel). Stamp coherently — and loudly.
      console.error(
        `[CANCEL-SUBSCRIPTION] SYNC-PATH: zero live Stripe subscriptions for customer ${customerId} (user ${userId}); stamping profile canceled WITHOUT touching Stripe.`
      );
      await supabaseAdmin
        .from("profiles")
        .update({
          subscription_status: "canceled",
          subscription_id: null,
          cancel_at_period_end: false,
          canceled_at: new Date().toISOString(),
          subscription_ends_at: new Date().toISOString(),
          membership_override: false,
        })
        .eq("id", userId);
      return new Response(
        JSON.stringify({
          success: true,
          synced: true,
          message: "Your subscription has been canceled.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Cancel EVERY live subscription.
    let latestPeriodEnd: number | null = null;
    for (const sub of liveAtPeriodEnd) {
      const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      const pe = updated.items?.data?.[0]?.current_period_end ?? updated.cancel_at ?? null;
      if (pe && (!latestPeriodEnd || pe > latestPeriodEnd)) latestPeriodEnd = pe;
      logStep("Set cancel_at_period_end", { subscriptionId: sub.id, status: sub.status });
    }
    for (const sub of liveCancelNow) {
      await stripe.subscriptions.cancel(sub.id);
      logStep("Canceled non-active subscription immediately", { subscriptionId: sub.id, status: sub.status });
    }

    const cancelAt = latestPeriodEnd
      ? new Date(latestPeriodEnd * 1000).toISOString()
      : new Date().toISOString();

    // Keep status "active" until the webhook flips it; clear override so override+paying members truly end.
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        cancel_at_period_end: true,
        subscription_ends_at: cancelAt,
        membership_override: false,
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
        cancel_at: cancelAt,
        message: `Membership will be cancelled at end of billing period (${cancelAt})`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in cancel-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
