import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { memberId } = await req.json();
    if (!memberId) {
      return new Response(JSON.stringify({ error: "memberId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get auth metadata
    const {
      data: { user: authUser },
      error: authError,
    } = await adminClient.auth.admin.getUserById(memberId);

    let lastSignInAt: string | null = null;
    let emailConfirmedAt: string | null = null;

    if (!authError && authUser) {
      lastSignInAt = authUser.last_sign_in_at ?? null;
      emailConfirmedAt = authUser.email_confirmed_at ?? null;
    }

    // 2. Get profile data for Stripe lookup
    const { data: profileData } = await adminClient
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", memberId)
      .single();

    let stripeCharges: Array<{
      id: string;
      amount: number;
      currency: string;
      description: string | null;
      status: string;
      created: number;
      payment_intent: string | null;
    }> = [];
    let resolvedStripeCustomerId: string | null = profileData?.stripe_customer_id ?? null;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && profileData) {
      try {
        const stripe = new Stripe(stripeKey, {
          apiVersion: "2025-08-27.basil",
        });

        // Resolve a valid cus_ ID
        let effectiveCustomerId = profileData.stripe_customer_id;

        if (!effectiveCustomerId?.startsWith("cus_") && profileData.email) {
          // Fallback: look up customer by email
          const customers = await stripe.customers.list({
            email: profileData.email,
            limit: 1,
          });
          if (customers.data.length > 0) {
            effectiveCustomerId = customers.data[0].id;
            // Auto-repair: save the correct cus_ ID back to the profile
            await adminClient
              .from("profiles")
              .update({ stripe_customer_id: effectiveCustomerId })
              .eq("id", memberId);
            console.log(`Auto-fixed stripe_customer_id for ${memberId}: ${effectiveCustomerId}`);
          } else {
            effectiveCustomerId = null;
          }
        }

        resolvedStripeCustomerId = effectiveCustomerId ?? null;

        // Fetch charges if we have a valid customer ID
        if (effectiveCustomerId?.startsWith("cus_")) {
          const charges = await stripe.charges.list({
            customer: effectiveCustomerId,
            limit: 50,
          });
          stripeCharges = charges.data.map((c) => ({
            id: c.id,
            amount: c.amount,
            currency: c.currency,
            description: c.description,
            status: c.status,
            created: c.created,
            payment_intent:
              typeof c.payment_intent === "string" ? c.payment_intent : null,
          }));
        }
      } catch (e) {
        console.error("Stripe fetch error:", e);
      }
    }

    return new Response(
      JSON.stringify({ lastSignInAt, emailConfirmedAt, stripeCharges, stripeCustomerId: resolvedStripeCustomerId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error("admin-member-details error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
