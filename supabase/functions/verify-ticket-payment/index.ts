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
  console.log(`[VERIFY-TICKET-PAYMENT] ${step}${detailsStr}`);
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { session_id, event_id } = await req.json();
    if (!session_id || !event_id) {
      throw new Error("Missing required fields: session_id, event_id");
    }
    logStep("Request parsed", { session_id, event_id });

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    logStep("Checkout session retrieved", {
      status: session.payment_status,
      customer_email: session.customer_details?.email,
    });

    if (session.payment_status !== "paid") {
      throw new Error(`Payment not completed. Status: ${session.payment_status}`);
    }

    // Verify event_id matches what was passed to checkout
    const sessionEventId = session.metadata?.event_id;
    if (!sessionEventId || sessionEventId !== event_id) {
      logStep("Event ID mismatch", { expected: event_id, actual: sessionEventId });
      return new Response(
        JSON.stringify({ error: "Session does not match this event" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Check for duplicate ticket (idempotency via stripe_payment_id)
    const paymentId = session.payment_intent as string;
    const { data: existingTicket } = await supabaseClient
      .from("tickets")
      .select("id")
      .eq("stripe_payment_id", paymentId)
      .maybeSingle();

    if (existingTicket) {
      logStep("Ticket already exists for this payment", { ticketId: existingTicket.id });
      return new Response(
        JSON.stringify({
          success: true,
          ticket_id: existingTicket.id,
          message: "Ticket already created",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Extract user info from session metadata or customer details
    const userId = session.metadata?.user_id || null;
    const guestEmail = session.customer_details?.email || null;
    const guestName = session.customer_details?.name || null;

    // Create the ticket record (using service role key bypasses RLS)
    const ticketData: Record<string, unknown> = {
      event_id,
      ticket_type: "paid",
      status: "confirmed",
      stripe_payment_id: paymentId,
      source: "stripe",
    };

    if (userId) {
      ticketData.user_id = userId;
    } else {
      ticketData.guest_email = guestEmail;
      ticketData.guest_name = guestName;
    }

    logStep("Creating ticket", ticketData);

    const { data: ticket, error: insertError } = await supabaseClient
      .from("tickets")
      .insert(ticketData)
      .select("id")
      .single();

    if (insertError) {
      if (insertError.message?.includes('Event is at capacity')) {
        return new Response(
          JSON.stringify({ error: 'Sorry, this event is now full.' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }
      throw new Error(`Failed to create ticket: ${insertError.message}`);
    }

    logStep("Ticket created successfully", { ticketId: ticket.id });

    // ── Send confirmation email with QR code ──
    try {
      const { data: eventData } = await supabaseClient
        .from("events")
        .select("title, start_time, end_time, location_name")
        .eq("id", event_id)
        .maybeSingle();

      if (eventData) {
        const recipientEmail = userId
          ? (await supabaseClient.from("profiles").select("email, full_name").eq("id", userId).maybeSingle()).data?.email
          : guestEmail;

        const recipientName = userId
          ? (await supabaseClient.from("profiles").select("full_name").eq("id", userId).maybeSingle()).data?.full_name || "there"
          : guestName || "there";

        if (recipientEmail) {
          const eventDate = new Date(eventData.start_time);
          const endDate = new Date(eventData.end_time);
          const formatDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
          const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

          const origin = session.metadata?.origin || "https://704collective.com";
          // For members, QR = user_id; for guests, QR = TKT-<ticket_id> (prefix so scanner knows it's a ticket)
          const qrData = userId || `TKT-${ticket.id}`;

          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              to: recipientEmail,
              template: "rsvp-confirmation",
              data: {
                name: recipientName,
                eventName: eventData.title,
                eventDate: formatDate(eventDate),
                eventTime: `${formatTime(eventDate)} – ${formatTime(endDate)}`,
                eventLocation: eventData.location_name || "TBA",
                eventUrl: `${origin}/events/${event_id}`,
                qrData,
              },
            }),
          });
          logStep("Confirmation email sent", { email: recipientEmail });
        }
      }
    } catch (emailErr) {
      const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      logStep("Confirmation email failed (non-blocking)", { error: msg });
    }

    // Log payment to payments table
    const { data: existingPayment } = await supabaseClient
      .from("payments")
      .select("id")
      .eq("stripe_payment_intent_id", paymentId)
      .maybeSingle();

    if (!existingPayment) {
      // Look up event title for description
      const { data: eventDataForPayment } = await supabaseClient
        .from("events")
        .select("title")
        .eq("id", event_id)
        .maybeSingle();

      const stripeCustomerId = typeof session.customer === "string"
        ? session.customer
        : (session.customer as { id?: string })?.id || null;

      const { error: paymentError } = await supabaseClient
        .from("payments")
        .insert({
          user_id: userId || null,
          stripe_payment_intent_id: paymentId,
          stripe_customer_id: stripeCustomerId,
          amount: session.amount_total || 0,
          currency: session.currency || "usd",
          status: "succeeded",
          payment_type: "ticket",
          description: `Event ticket: ${eventDataForPayment?.title || "Unknown event"}`,
          metadata: { session_id: session.id, event_id, ticket_id: ticket.id },
        });

      if (paymentError) {
        logStep("Payment logging error (non-blocking)", { error: paymentError.message });
      } else {
        logStep("Payment logged successfully");
      }
    } else {
      logStep("Payment already logged, skipping", { paymentId });
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_id: ticket.id,
        message: "Ticket confirmed",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logStep("ERROR in verify-ticket-payment", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
