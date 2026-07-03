// Auth pattern: Stripe-adjacent / service-role.
// Called from the payment-success page after Stripe checkout.
// Uses SUPABASE_SERVICE_ROLE_KEY and verifies the Stripe session directly.
// No user JWT check.

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

    // Duplicate-payment guard (idempotency via stripe_payment_id in attendance_credentials)
    const paymentId = session.payment_intent as string;
    const { data: existingCred } = await supabaseClient
      .from("attendance_credentials")
      .select("id, token")
      .filter("metadata->>stripe_payment_id", "eq", paymentId)
      .maybeSingle();

    if (existingCred) {
      logStep("Credential already exists for this payment", { credentialId: existingCred.id });
      return new Response(
        JSON.stringify({
          success: true,
          credential_id: existingCred.id,
          token: existingCred.token,
          message: "Ticket already created",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Resolve the buyer's identity
    const userId = session.metadata?.user_id || null;
    const buyerEmail = session.customer_details?.email || null;

    // Captured on our gate (guest checkout) and passed via Stripe session metadata.
    // Prefer these over Stripe's customer_details so we get the name/phone WE
    // collected for marketing. Empty strings (member checkout) fall back to Stripe.
    const capturedFirst = (session.metadata?.guest_first_name || "").trim();
    const capturedLast = (session.metadata?.guest_last_name || "").trim();
    const capturedPhone = (session.metadata?.guest_phone || "").trim();
    const capturedName = `${capturedFirst} ${capturedLast}`.trim();
    const buyerName = capturedName || session.customer_details?.name || null;

    const { data: personByProfile } = userId
      ? await supabaseClient.from("people").select("id").filter("metadata->>profile_id", "eq", userId).maybeSingle()
      : { data: null };

    let personId = personByProfile?.id ?? null;

    if (!personId && buyerEmail) {
      const { data: personByEmail } = await supabaseClient
        .from("people")
        .select("id")
        .eq("email_lower", buyerEmail.toLowerCase().trim())
        .maybeSingle();
      personId = personByEmail?.id ?? null;
    }

    if (!personId) {
      if (!buyerEmail) throw new Error("No buyer email available to create person record");
      const { data: newPerson, error: personErr } = await supabaseClient
        .from("people")
        .insert({
          email: buyerEmail,
          full_name: buyerName,
          phone: capturedPhone || null,
          roles: ["guest"],
          metadata: {
            source: "verify_ticket_payment",
            acquired_via: "public_ticket",
            acquisition_event_id: event_id,
            acquired_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();
      if (personErr) throw new Error(`Failed to create person: ${personErr.message}`);
      personId = newPerson.id;
    }

    logStep("Person resolved", { personId });

    // Generate a credential token: 'C-' + 10 uppercase hex chars
    const tokenBytes = new Uint8Array(8);
    crypto.getRandomValues(tokenBytes);
    const token = "C-" + Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();

    // Capacity backstop (DB trigger trg_enforce_event_capacity also enforces atomically)
    const { data: eventCapRow } = await supabaseClient.from("events").select("capacity").eq("id", event_id).single();
    if (eventCapRow?.capacity != null) {
      const { count: capCount } = await supabaseClient
        .from("attendance_credentials")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event_id)
        .in("status", ["active", "used"]);
      if (typeof capCount === "number" && capCount >= eventCapRow.capacity) {
        logStep("SOLD OUT after payment — manual refund needed", { paymentId, capCount });
        return new Response(
          JSON.stringify({ error: "This event sold out during checkout. Your payment will be refunded.", needs_refund: true, payment_intent: paymentId }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    logStep("Creating attendance credential", { personId, event_id, token });

    const { data: credential, error: insertError } = await supabaseClient
      .from("attendance_credentials")
      .insert({
        token,
        person_id: personId,
        event_id,
        credential_type: "public_rsvp",
        status: "active",
        metadata: {
          source: "verify_ticket_payment",
          stripe_payment_id: paymentId,
          amount_paid_cents: session.amount_total ?? 0,
        },
      })
      .select("id, token")
      .single();

    if (insertError) {
      if (insertError.message?.includes("EVENT_AT_CAPACITY")) {
        logStep("SOLD OUT after payment — manual refund needed", { paymentId, trigger: true });
        return new Response(
          JSON.stringify({ error: "This event sold out during checkout. Your payment will be refunded.", needs_refund: true, payment_intent: paymentId }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // 23505 = unique violation (one_active_credential_per_person_per_event)
      if ((insertError as { code?: string }).code === "23505") {
        console.warn("[VERIFY-TICKET-PAYMENT] Duplicate active credential detected", {
          event_id,
          personId,
          paymentId,
        });
        const { data: existingActive } = await supabaseClient
          .from("attendance_credentials")
          .select("id, token")
          .eq("person_id", personId)
          .eq("event_id", event_id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        if (existingActive) {
          return new Response(
            JSON.stringify({
              success: true,
              credential_id: existingActive.id,
              token: existingActive.token,
              duplicate_detected: true,
              message: "You already have a ticket for this event. Your duplicate payment will be refunded.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }
      throw new Error(`Failed to create credential: ${insertError.message}`);
    }

    logStep("Attendance credential created", { credentialId: credential.id, token: credential.token });

    // Send confirmation email with QR code
    try {
      const { data: eventData } = await supabaseClient
        .from("events")
        .select("title, start_time, end_time, location_name")
        .eq("id", event_id)
        .maybeSingle();

      if (eventData) {
        const [profileRes] = await Promise.all([
          userId
            ? supabaseClient.from("profiles").select("email, full_name, calendar_token").eq("id", userId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const recipientEmail = userId ? profileRes.data?.email : buyerEmail;
        const recipientName  = userId ? (profileRes.data?.full_name || "there") : (buyerName || "there");
        const calendarToken  = userId ? (profileRes.data?.calendar_token ?? undefined) : undefined;

        if (recipientEmail) {
          const eventDate = new Date(eventData.start_time);
          const endDate   = eventData.end_time ? new Date(eventData.end_time) : new Date(eventDate.getTime() + 2 * 60 * 60 * 1000);
          const formatDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
          const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

          const origin = session.metadata?.origin || "https://704collective.com";
          // QR encodes the credential token - same token used by the scanner
          const qrData = credential.token;

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
                eventTime: `${formatTime(eventDate)} - ${formatTime(endDate)}`,
                eventLocation: eventData.location_name || "TBA",
                eventUrl: `${origin}/events/${event_id}`,
                qrData,
                origin,
                startTimeIso: eventData.start_time,
                endTimeIso: eventData.end_time || endDate.toISOString(),
                calendarToken,
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
          metadata: { session_id: session.id, event_id, credential_id: credential.id },
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
        credential_id: credential.id,
        token: credential.token,
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
