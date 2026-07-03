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
    const { eventId, eventTitle, buyerEmail, buyerFirstName, buyerLastName, buyerPhone } = body;

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

    // Sweep-aware: read NEW canonical columns first, fall back to deprecated
    // columns for old events that haven't been migrated yet.
    const { data: eventData, error: eventError } = await supabaseAdmin
      .from("events")
      .select("capacity, required_tier, price_cents, member_price_cents, ticket_price_deprecated, social_member_price_deprecated, business_member_price_deprecated, access_type_deprecated")
      .eq("id", eventId)
      .single();

    if (eventError || !eventData) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // Derive ticket_mode + prices from canonical columns (sweep schema).
    // Falls back to deprecated columns if canonical not populated.
    const tier = (eventData as any).required_tier ?? "public";
    const isPublic = tier === "public";
    const publicCents = (eventData as any).price_cents ?? (eventData as any).ticket_price_deprecated ?? 0;
    const memberCents = (eventData as any).member_price_cents ?? (eventData as any).social_member_price_deprecated ?? 0;

    let derivedTicketMode: "none" | "public_only" | "all";
    if (!isPublic || publicCents <= 0) {
      derivedTicketMode = "none";
    } else if (memberCents > 0) {
      derivedTicketMode = "all";
    } else {
      derivedTicketMode = "public_only";
    }

    // Normalize the in-function event shape so the rest of the function (which
    // already reads ticket_mode/ticket_price/etc) keeps working unchanged.
    (eventData as any).ticket_mode = derivedTicketMode;
    (eventData as any).ticket_price = publicCents;
    (eventData as any).social_member_price = memberCents;
    (eventData as any).business_member_price = memberCents;
    (eventData as any).access_type = isPublic ? (publicCents > 0 ? "public_ticketed" : "public_free") : "members_only";

    // D2: Guard against non-ticketed events
    if (!eventData.ticket_mode || eventData.ticket_mode === "none") {
      return new Response(
        JSON.stringify({ error: "This event is not ticketed - please RSVP for free." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Capacity guard: never open a checkout session for a full event
    if ((eventData as any).capacity != null) {
      const { count: capCount } = await supabaseAdmin
        .from("attendance_credentials")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("status", ["active", "used"]);
      if (typeof capCount === "number" && capCount >= (eventData as any).capacity) {
        logStep("Blocked: event at capacity", { capCount, capacity: (eventData as any).capacity });
        return new Response(
          JSON.stringify({ error: "This event is sold out." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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

    // Guest checkout: trust buyerEmail from the pre-checkout email gate ONLY when
    // there is no authenticated user. Never let a passed email override a
    // logged-in user's real identity. Feeds the existing Stripe-customer dedupe
    // (stripe.customers.list) and customer_email below, and downstream the
    // email_lower match in verify-ticket-payment - no duplicate people/customers.
    if (!userId && typeof buyerEmail === "string" && buyerEmail.trim()) {
      const candidate = buyerEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(candidate)) {
        userEmail = candidate;
        logStep("Guest email accepted from request body", { userEmail });
      } else {
        logStep("Guest email rejected (bad format), proceeding without", { buyerEmail });
      }
    }

    // --- Member-type lookup for tier pricing ---
    let memberType: string | null = null;
    if (userId) {
      const { data: memberProfile } = await supabaseAdmin
        .from("profiles")
        .select("member_type, subscription_status, membership_override, deleted_at")
        .eq("id", userId)
        .maybeSingle();

      const isActiveMember =
        !!memberProfile &&
        memberProfile.deleted_at == null &&
        (memberProfile.subscription_status === "active" ||
          memberProfile.subscription_status === "trialing" ||
          memberProfile.membership_override === true);

      if (isActiveMember) {
        memberType = memberProfile?.member_type ?? null;
      }
      logStep("Member type resolved", { memberType, isActiveMember });

      // D3: Members should not pay for public_only events — they RSVP free
      if (eventData.ticket_mode === "public_only" && isActiveMember && memberType != null) {
        return new Response(
          JSON.stringify({ error: "Members do not need to purchase a ticket for this event - RSVP for free." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Tier-aware price resolution keyed on ticket_mode ---
    let resolvedPrice: number;
    if (eventData.ticket_mode === "public_only") {
      // Only guests reach this point (members blocked above); always charge public price
      resolvedPrice = eventData.ticket_price ?? 0;
    } else {
      // ticket_mode === 'all': tier-based pricing
      if (memberType === "business" || memberType === "partner") {
        resolvedPrice =
          eventData.business_member_price ??
          eventData.social_member_price ??
          eventData.ticket_price ??
          0;
      } else if (memberType === "social") {
        resolvedPrice = eventData.social_member_price ?? eventData.ticket_price ?? 0;
      } else {
        // guest / non-member
        resolvedPrice = eventData.ticket_price ?? 0;
      }
    }

    if (resolvedPrice <= 0) {
      return new Response(
        JSON.stringify({ error: "This event is free for you - please RSVP instead." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unitAmount = resolvedPrice;
    logStep("Ticket price resolved", { unitAmount, memberType });

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

    // Always route through /payment-success so verify-ticket-payment runs and creates the ticket + sends email
    const successUrl = `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&event_id=${eventId}`;
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
        ticket_mode: eventData.ticket_mode ?? "unknown",
        resolved_price_cents: String(resolvedPrice),
        member_type_at_purchase: memberType ?? "guest",
        guest_first_name: (!userId && typeof buyerFirstName === "string") ? buyerFirstName.trim().slice(0, 100) : "",
        guest_last_name: (!userId && typeof buyerLastName === "string") ? buyerLastName.trim().slice(0, 100) : "",
        guest_phone: (!userId && typeof buyerPhone === "string") ? buyerPhone.trim().slice(0, 40) : "",
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
