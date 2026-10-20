import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyAccountUpdated } from "../_shared/connectAccountUpdated.ts";

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-CONNECT-WEBHOOK] ${step}${d}`);
};

function getStripe() {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    log("Webhook received");

    const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
    if (!webhookSecret) throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET not set");

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      log("Missing stripe-signature header");
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("Signature verification failed", { error: msg });
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    log("Event verified", { id: event.id, type: event.type });

    const { data: inserted, error: idempotencyErr } = await supabase
      .from("processed_webhook_events")
      .upsert(
        { stripe_event_id: event.id, event_type: event.type },
        { onConflict: "stripe_event_id", ignoreDuplicates: true },
      )
      .select("stripe_event_id");

    if (idempotencyErr) {
      log("Idempotency check error", { error: idempotencyErr.message });
      return new Response("Internal error", { status: 500 });
    }

    if (!inserted || inserted.length === 0) {
      log("Event already processed, skipping", { id: event.id });
      return new Response(JSON.stringify({ received: true, message: "Event already processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      if (event.type === "account.updated") {
        await applyAccountUpdated(event, supabase, log);
      } else {
        log("Unhandled event type", { type: event.type });
      }
    } catch (handlerErr) {
      const hMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
      log("Handler failed - removing processed marker so Stripe retry re-runs", {
        id: event.id,
        type: event.type,
        error: hMsg,
      });
      const { error: cleanupErr } = await supabase
        .from("processed_webhook_events")
        .delete()
        .eq("stripe_event_id", event.id);
      if (cleanupErr) {
        log("CRITICAL: failed to delete processed marker after handler error - this event will NOT be retried", {
          id: event.id,
          error: cleanupErr.message,
        });
      }
      return new Response(JSON.stringify({ error: "Handler failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[STRIPE-CONNECT-WEBHOOK] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
