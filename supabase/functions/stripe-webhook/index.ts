import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${d}`);
};

// ── helpers ──────────────────────────────────────────────────────────────

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

/** Find profile(s) by stripe_customer_id. Returns first match or null. */
async function findProfileByCustomerId(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId);

  if (error) {
    log("Profile lookup error", { error: error.message });
    return null;
  }
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    log("WARNING: multiple profiles share stripe_customer_id", {
      stripeCustomerId,
      count: data.length,
    });
  }
  return data[0];
}

/** Insert a payment row, gracefully handling duplicate stripe_event_id. */
async function insertPayment(
  supabase: ReturnType<typeof createClient>,
  payment: Record<string, unknown>
) {
  const { error } = await supabase.from("payments").insert(payment);
  if (error) {
    // unique constraint on stripe_event_id → already logged
    if (error.code === "23505") {
      log("Payment already recorded (duplicate), skipping");
      return;
    }
    log("Payment insert error (non-blocking)", { error: error.message });
  }
}

// ── event handlers ───────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  event: Stripe.Event,
  stripe: Stripe,
  supabase: ReturnType<typeof createClient>
) {
  const session = event.data.object as Stripe.Checkout.Session;

  const customerEmail =
    session.customer_details?.email ||
    (typeof session.customer === "object" ? (session.customer as Stripe.Customer)?.email : null);

  if (!customerEmail) {
    log("No customer email in checkout session, skipping");
    return;
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer)?.id || null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription)?.id || null;

  const customerName = session.customer_details?.name || "";

  // ── Phase A: Product Identification ──────────────────────────────────

  const socialProductId = Deno.env.get("STRIPE_SOCIAL_PRODUCT_ID");
  if (!socialProductId) {
    log("WARNING: STRIPE_SOCIAL_PRODUCT_ID not set — skipping onboarding pipeline (fail-safe)");
  }

  let isSocialMembership = false;
  let lineItemName = "Checkout purchase";

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price.product"],
    });

    const firstItem = lineItems.data?.[0];
    if (firstItem) {
      lineItemName = firstItem.description || lineItemName;
      const product = firstItem.price?.product;
      const productId = typeof product === "string" ? product : (product as Stripe.Product)?.id;

      if (socialProductId && productId === socialProductId) {
        isSocialMembership = true;
      }

      log("Product identified", { productId, isSocialMembership, lineItemName });
    } else {
      log("WARNING: No line items found on session", { sessionId: session.id });
    }
  } catch (lineItemErr) {
    const msg = lineItemErr instanceof Error ? lineItemErr.message : String(lineItemErr);
    log("WARNING: Failed to retrieve line items (fail-safe, skipping onboarding)", { error: msg });
  }

  // ── Phase B: Conditional Routing ─────────────────────────────────────

  let userId: string | null = null;
  let memberAction: "new" | "reactivated" | "existing_active" | "skipped" = "skipped";

  if (isSocialMembership) {
    log("Social Membership checkout — running onboarding pipeline", { email: customerEmail });

    // Check for existing profile (including soft-deleted)
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", customerEmail.toLowerCase());

    const activeProfile = allProfiles?.find((p: any) => !p.deleted_at);
    const softDeletedProfile = allProfiles?.find((p: any) => p.deleted_at);

    if (activeProfile) {
      // ── existing active member ──
      userId = activeProfile.id;
      memberAction = "existing_active";
      log("Updating existing active profile", { userId });

      await supabase
        .from("profiles")
        .update({
          subscription_status: "active",
          stripe_customer_id: stripeCustomerId,
          subscription_id: subscriptionId,
        })
        .eq("id", userId);
    } else if (softDeletedProfile) {
      // ── reactivate soft-deleted member ──
      userId = softDeletedProfile.id;
      memberAction = "reactivated";
      log("Reactivating soft-deleted profile", { userId });

      await supabase
        .from("profiles")
        .update({
          deleted_at: null,
          subscription_status: "active",
          stripe_customer_id: stripeCustomerId,
          subscription_id: subscriptionId,
          member_since: new Date().toISOString(),
        })
        .eq("id", userId);

      const { error: unbanErr } = await supabase.auth.admin.updateUserById(
        userId,
        { ban_duration: "none" }
      );
      if (unbanErr) log("Failed to unban user (non-blocking)", { error: unbanErr.message });
      else log("User unbanned successfully");
    } else {
      // ── brand-new member ──
      memberAction = "new";
      log("Creating new member account", { email: customerEmail });

      const tempPassword = crypto.randomUUID() + "Aa1!";
      let createResult = await supabase.auth.admin.createUser({
        email: customerEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: customerName },
      });

      if (createResult.error) {
        if (createResult.error.message?.includes("already been registered")) {
          log("Auth user already exists, looking up by email (O(1))");
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", customerEmail.toLowerCase())
            .is("deleted_at", null)
            .maybeSingle();

          if (existingProfile) {
            userId = existingProfile.id;
          } else {
            const { data: userData, error: lookupErr } = await supabase.auth.admin.getUserByEmail(customerEmail);
            if (lookupErr || !userData?.user) throw new Error("User registered but not found in auth or profiles");
            userId = userData.user.id;
            log("Resolved via getUserByEmail fallback", { userId });
          }
        } else {
          throw new Error(`Failed to create user: ${createResult.error.message}`);
        }
      } else {
        userId = createResult.data.user.id;
      }

      log("New auth user", { userId });

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: userId!,
          email: customerEmail,
          full_name: customerName,
          subscription_status: "active",
          subscription_id: subscriptionId,
          stripe_customer_id: stripeCustomerId,
          member_since: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (profileErr) {
        log("Profile upsert error, trying update", { error: profileErr.message });
        await supabase
          .from("profiles")
          .update({
            subscription_status: "active",
            subscription_id: subscriptionId,
            stripe_customer_id: stripeCustomerId,
            member_since: new Date().toISOString(),
            full_name: customerName,
          })
          .eq("id", userId!);
      }

      await supabase
        .from("user_roles")
        .upsert({ user_id: userId!, role: "member" }, { onConflict: "user_id,role" });

      const { error: resetErr } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: customerEmail,
      });
      if (resetErr) log("Password reset link error (non-blocking)", { error: resetErr.message });
      else log("Password recovery link generated");
    }

    // ── Welcome email (only for new or reactivated) ──
    if (memberAction === "new" || memberAction === "reactivated") {
      const suppressEmails = Deno.env.get("SUPPRESS_WELCOME_EMAILS") === "true";
      if (suppressEmails) {
        log("Email suppressed (SUPPRESS_WELCOME_EMAILS=true)", { email: customerEmail, memberAction });
      } else {
        try {
          const { data: profileForEmail } = await supabase
            .from("profiles")
            .select("calendar_token")
            .eq("id", userId!)
            .single();

          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const calendarToken = profileForEmail?.calendar_token ?? "";
          const calendarUrl = `webcal://${supabaseUrl.replace("https://", "")}/functions/v1/calendar-feed?token=${calendarToken}`;

          const sessionOrigin = session.metadata?.origin || "";
          if (!sessionOrigin) {
            log("WARNING: No origin in session metadata, welcome email links may be broken");
          }

          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              to: customerEmail,
              template: "welcome",
              data: { name: customerName || "there", calendarUrl, origin: sessionOrigin },
            }),
          });
          log("Welcome email sent", { email: customerEmail, memberAction });
        } catch (emailErr) {
          const emailMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          log("Welcome email failed (non-blocking)", { error: emailMsg });
        }
      }
    } else {
      log("Skipping welcome email for existing active member", { userId });
    }
  } else {
    log("Non-social checkout — skipping onboarding pipeline", { lineItemName });
  }

  // ── Phase C: Payment Logging (always runs) ───────────────────────────

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent)?.id || null;

  const paymentType = isSocialMembership
    ? "subscription"
    : session.mode === "subscription"
      ? "subscription"
      : "one_time";

  await insertPayment(supabase, {
    user_id: userId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_customer_id: stripeCustomerId,
    stripe_event_id: event.id,
    amount: session.amount_total || 0,
    currency: session.currency || "usd",
    status: "succeeded",
    payment_type: paymentType,
    description: lineItemName,
    metadata: { session_id: session.id, member_action: memberAction },
  });

  log("checkout.session.completed processed", { memberAction, isSocialMembership });
}

async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
  supabase: ReturnType<typeof createClient>
) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer)?.id || null;

  if (!stripeCustomerId) {
    log("No customer ID on invoice, skipping");
    return;
  }

  const profile = await findProfileByCustomerId(supabase, stripeCustomerId);

  if (profile) {
    const periodEnd = invoice.lines?.data?.[0]?.period?.end;
    const updates: Record<string, unknown> = { subscription_status: "active" };
    if (periodEnd) {
      updates.subscription_ends_at = new Date(periodEnd * 1000).toISOString();
    }
    await supabase.from("profiles").update(updates).eq("id", profile.id);
    log("Profile updated to active", { userId: profile.id });

    await insertPayment(supabase, {
      user_id: profile.id,
      stripe_customer_id: stripeCustomerId,
      stripe_event_id: event.id,
      amount: invoice.amount_paid || 0,
      currency: invoice.currency || "usd",
      status: "succeeded",
      payment_type: "subscription",
      description: "Recurring membership payment",
    });
  } else {
    log("WARNING: No profile found for invoice.payment_succeeded", { stripeCustomerId });
  }
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  supabase: ReturnType<typeof createClient>
) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer)?.id || null;

  if (!stripeCustomerId) {
    log("No customer ID on failed invoice, skipping");
    return;
  }

  const profile = await findProfileByCustomerId(supabase, stripeCustomerId);

  if (profile) {
    await supabase
      .from("profiles")
      .update({ subscription_status: "past_due" })
      .eq("id", profile.id);
    log("Profile marked past_due", { userId: profile.id });

    await insertPayment(supabase, {
      user_id: profile.id,
      stripe_customer_id: stripeCustomerId,
      stripe_event_id: event.id,
      amount: invoice.amount_due || 0,
      currency: invoice.currency || "usd",
      status: "failed",
      payment_type: "subscription",
      description: "Failed membership payment",
    });
  } else {
    log("WARNING: No profile found for invoice.payment_failed", { stripeCustomerId });
  }
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  supabase: ReturnType<typeof createClient>
) {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as Stripe.Customer)?.id || null;

  if (!stripeCustomerId) {
    log("No customer ID on deleted subscription, skipping");
    return;
  }

  const profile = await findProfileByCustomerId(supabase, stripeCustomerId);

  if (profile) {
    await supabase
      .from("profiles")
      .update({ subscription_status: "canceled", subscription_id: null })
      .eq("id", profile.id);
    log("Subscription canceled", { userId: profile.id });
  } else {
    log("WARNING: No profile found for subscription.deleted", { stripeCustomerId });
  }
}

async function handleSubscriptionUpdated(
  event: Stripe.Event,
  supabase: ReturnType<typeof createClient>
) {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as Stripe.Customer)?.id || null;

  if (!stripeCustomerId) {
    log("No customer ID on updated subscription, skipping");
    return;
  }

  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    trialing: "active",
  };

  const mappedStatus = statusMap[subscription.status] || null;
  if (!mappedStatus) {
    log("Unmapped subscription status, skipping update", { status: subscription.status });
    return;
  }

  const profile = await findProfileByCustomerId(supabase, stripeCustomerId);

  if (profile) {
    const updates: Record<string, unknown> = {
      subscription_status: mappedStatus,
      subscription_id: subscription.id,
    };
    if (subscription.current_period_end) {
      updates.subscription_ends_at = new Date(
        subscription.current_period_end * 1000
      ).toISOString();
    }
    await supabase.from("profiles").update(updates).eq("id", profile.id);
    log("Subscription status synced", { userId: profile.id, status: mappedStatus });
  } else {
    log("WARNING: No profile found for subscription.updated", { stripeCustomerId });
  }
}

// ── main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    log("Webhook received");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");

    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    // Read raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      log("Missing stripe-signature header");
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("Signature verification failed", { error: msg });
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    log("Event verified", { id: event.id, type: event.type });

    // Atomic idempotency: insert-or-ignore in one operation
    const { data: inserted, error: idempotencyErr } = await supabase
      .from("processed_webhook_events")
      .upsert(
        { stripe_event_id: event.id, event_type: event.type },
        { onConflict: "stripe_event_id", ignoreDuplicates: true }
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

    // Route to handler
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event, stripe, supabase);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event, supabase);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event, supabase);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event, supabase);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event, supabase);
        break;
      default:
        log("Unhandled event type", { type: event.type });
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[STRIPE-WEBHOOK] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
