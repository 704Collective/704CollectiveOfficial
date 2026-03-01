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

// Price ID for the 704 Collective Membership - $30/month
const MEMBERSHIP_PRICE_ID = "price_1Sc9YiRzSIH3EgWL7h547P7G";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Parse request body (all fields optional for guest checkout)
    const body = await req.json().catch(() => ({}));
    const guestEmail = body.email;
    const guestName = body.name;

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
          price: MEMBERSHIP_PRICE_ID,
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
