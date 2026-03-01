import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-TICKET-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.json();
    const { eventId, eventTitle } = body;

    if (!eventId || !eventTitle) {
      throw new Error("Missing required fields: eventId, eventTitle");
    }
    logStep("Request body parsed", { eventId, eventTitle });

    // Fetch the actual ticket price from the database (server-side)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: eventData, error: eventError } = await supabaseAdmin
      .from("events")
      .select("ticket_price")
      .eq("id", eventId)
      .single();

    if (eventError || !eventData) {
      throw new Error(`Event not found: ${eventId}`);
    }

    if (!eventData.ticket_price || eventData.ticket_price <= 0) {
      throw new Error("This event does not have a valid ticket price");
    }

    const unitAmount = eventData.ticket_price;
    logStep("Ticket price fetched from DB", { unitAmount });

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

    // --- Stripe customer: profile-first lookup (only for authenticated users) ---
    let customerId: string | undefined;

    if (userId) {
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
    if (!customerId && userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer by email", { customerId });
      }
    }

    const origin = req.headers.get("origin") || "https://704collective.com";

    // Route authenticated users to dashboard, guests to payment verification
    const successUrl = userId
      ? `${origin}/dashboard?ticket_purchased=${eventId}`
      : `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&event_id=${eventId}`;
    logStep("Success URL determined", { authenticated: !!userId, successUrl });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      allow_promotion_codes: true,
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Ticket: ${eventTitle}`,
              description: `One-time ticket for ${eventTitle}`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: `${origin}/events/${eventId}`,
      metadata: {
        event_id: eventId,
        user_id: userId || "",
        ticket_type: "paid",
        origin: origin,
      },
    };

    // For guest checkout, collect customer details
    if (!userId) {
      sessionParams.customer_creation = "always";
      sessionParams.billing_address_collection = "required";
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-ticket-checkout", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
