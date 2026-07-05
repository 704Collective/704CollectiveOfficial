// AUTH PATTERN: browser admin call. Verifies the caller's user JWT, checks the
// admin role, then uses a service-role client for Stripe refund + DB write.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? " - " + JSON.stringify(details) : "";
  console.log("[ADMIN-REFUND-TICKET] " + step + d);
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // ── 1. Admin gate (same pattern as admin-delete-user) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No authorization header" }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }
    logStep("Admin verified", { callerId: caller.id });

    // ── 2. Parse body ──
    const body = await req.json();
    const credential_id = body?.credential_id;
    if (!credential_id) {
      return jsonResponse({ error: "credential_id is required" }, 400);
    }

    // ── 3. Fetch the credential ──
    const { data: credential, error: credError } = await supabaseAdmin
      .from("attendance_credentials")
      .select("id, event_id, person_id, credential_type, status, metadata")
      .eq("id", credential_id)
      .maybeSingle();

    if (credError) {
      logStep("Credential lookup failed", { error: credError.message });
      return jsonResponse({ error: "Credential lookup failed" }, 500);
    }
    if (!credential) {
      return jsonResponse({ error: "Credential not found" }, 404);
    }
    if (credential.status === "voided") {
      logStep("Already voided", { credential_id });
      return jsonResponse({ already_voided: true, refunded: false }, 200);
    }

    // ── 4-5. Stripe refund (if there was a payment) ──
    const paymentId: string | null = credential.metadata?.stripe_payment_id ?? null;
    let refunded = false;

    if (paymentId) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        return jsonResponse({ error: "Stripe refund failed: STRIPE_SECRET_KEY not set" }, 502);
      }
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      try {
        const refund = await stripe.refunds.create({
          payment_intent: paymentId,
          reason: "requested_by_customer",
        });
        refunded = true;
        logStep("Refund created", { paymentId, refundId: refund.id });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : String(err);
        if (code === "charge_already_refunded" || message.includes("already been refunded")) {
          refunded = true;
          logStep("Charge was already refunded, continuing to void", { paymentId });
        } else {
          logStep("Stripe refund failed - NOT voiding", { paymentId, error: message });
          return jsonResponse({ error: "Stripe refund failed: " + message }, 502);
        }
      }
    } else {
      logStep("No stripe_payment_id on credential - void only", { credential_id });
    }

    // ── 6. Void the credential ──
    const newMetadata = {
      ...(credential.metadata ?? {}),
      voided_reason: "admin_remove_refund",
      refunded,
      refunded_payment_intent: paymentId,
      voided_by: caller.id,
      voided_at: new Date().toISOString(),
    };
    const { error: voidError } = await supabaseAdmin
      .from("attendance_credentials")
      .update({ status: "voided", metadata: newMetadata })
      .eq("id", credential_id);

    if (voidError) {
      logStep("Void update failed", { error: voidError.message, refunded });
      return jsonResponse(
        { error: "Refund " + (refunded ? "succeeded" : "skipped") + " but voiding failed: " + voidError.message },
        500,
      );
    }

    logStep("Credential voided", { credential_id, refunded, paymentId });
    return jsonResponse({ voided: true, refunded, payment_intent: paymentId }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ADMIN-REFUND-TICKET] Internal error:", msg);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
