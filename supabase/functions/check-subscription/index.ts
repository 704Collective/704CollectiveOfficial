import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");

    // Use anon key + user's auth header for proper JWT validation on cookie-based auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    // Also create a service-role client for privileged operations (profile updates)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Use getClaims instead of getUser — getClaims validates the JWT signature directly
    // without requiring an active session, which avoids "Auth session missing!" errors
    // when the session has been invalidated but the JWT hasn't expired yet.
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      logStep("Authentication failed", { message: claimsError?.message ?? "No claims" });
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const claims = claimsData.claims;
    const userId = claims.sub as string;
    const userEmail = claims.email as string;

    if (!userId || !userEmail) {
      logStep("Missing user claims", { userId, userEmail });
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const user = { id: userId, email: userEmail };
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("subscription_status, subscription_ends_at, stripe_customer_id, member_since, membership_override")
      .eq("id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (profileError) {
      // Don't block subscription checks if profile fetch fails; just log.
      logStep("Profile fetch error", { message: profileError.message });
    }

    // If membership_override is true AND no Stripe customer, skip sync (truly admin-managed).
    // If they have a stripe_customer_id, proceed with normal sync even if override is set.
    if (profile?.membership_override === true && !profile?.stripe_customer_id) {
      logStep("Membership override enabled; skipping Stripe sync", {
        currentStatus: profile.subscription_status,
      });

      return new Response(
        JSON.stringify({
          subscribed: profile.subscription_status === "active",
          subscription_status: profile.subscription_status ?? "inactive",
          product_id: null,
          subscription_end: profile.subscription_ends_at,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Prefer stored Stripe customer id. Email matching can fail if the user changes their email.
    let customerId: string | null = profile?.stripe_customer_id ?? null;

    if (customerId) {
      logStep("Using stored Stripe customer", { customerId });
    } else {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found Stripe customer by email", { customerId });

        // Persist for future checks.
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("id", user.id);
      }
    }

    // If there's no Stripe customer, do NOT overwrite membership status.
    // This allows admins to manually set subscription_status (e.g. complimentary/manual members).
    if (!customerId) {
      logStep("No Stripe customer found; leaving membership status unchanged");

      return new Response(
        JSON.stringify({
          subscribed: false,
          subscription_status: profile?.subscription_status ?? "inactive",
          product_id: null,
          subscription_end: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    logStep("Stripe customer resolved", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;
    let subscriptionStatus = "inactive";

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      productId = subscription.items.data[0].price.product as string;
      subscriptionStatus = "active";
      logStep("Active subscription found", { subscriptionId: subscription.id, productId, endDate: subscriptionEnd });
    } else {
      logStep("No active subscription found");
    }

    // Update profile with subscription status
    const updateData: Record<string, unknown> = {
      subscription_status: subscriptionStatus,
      subscription_ends_at: subscriptionEnd,
    };

    // Set member_since if this is a new active subscription
    if (hasActiveSub) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("member_since")
        .eq("id", user.id)
        .is("deleted_at", null)
        .single();

      if (!profileData?.member_since) {
        updateData.member_since = new Date().toISOString();
      }
    }

    await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    logStep("Profile updated", { subscriptionStatus, subscriptionEnd });

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      subscription_status: subscriptionStatus,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
