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

/** Find profile(s) by stripe_customer_id. Returns first non-deleted match or null. */
async function findProfileByCustomerId(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .is("deleted_at", null);

  if (error) {
    log("Profile lookup error", { error: error.message });
    return null;
  }
  if (!data || data.length === 0) {
    // Check if there's a deleted profile for logging purposes
    const { data: deletedData } = await supabase
      .from("profiles")
      .select("id, deleted_at")
      .eq("stripe_customer_id", stripeCustomerId)
      .not("deleted_at", "is", null)
      .limit(1);

    if (deletedData && deletedData.length > 0) {
      log("Skipping webhook - profile is soft-deleted", {
        stripeCustomerId,
        profileId: deletedData[0].id,
        deletedAt: deletedData[0].deleted_at,
      });
    }
    return null;
  }
  if (data.length > 1) {
    log("WARNING: multiple profiles share stripe_customer_id", {
      stripeCustomerId,
      count: data.length,
    });
  }
  return data[0];
}

/** Insert a payment row, gracefully handling duplicate stripe_event_id. */
/** Welcome post for brand-new social members (checkout.session.completed). */
async function insertNewSocialMemberWelcomePost(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  fallbackName: string
) {
  const { data: p, error: fetchErr } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (fetchErr) {
    log("Welcome feed post: profile fetch failed (non-blocking)", { error: fetchErr.message });
    return;
  }

  const firstName = (p?.full_name || fallbackName || "").trim().split(/\s+/)[0] || "there";
  const content =
    `🎉 Welcome ${firstName} to 704 Collective! They just joined the community - drop a hello below and make them feel at home!`;
  const image_urls = p?.avatar_url ? [p.avatar_url] : [];

  const { error: postErr } = await supabase.from("posts").insert({
    author_id: userId,
    feed_type: "social",
    content,
    image_urls,
    created_at: new Date().toISOString(),
  });

  if (postErr) {
    log("Welcome feed post insert failed (non-blocking)", { error: postErr.message });
  } else {
    log("Welcome feed post created for new social member", { userId });
  }
}

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
/**
 * Additive new-schema sync. Upserts the member's row in the `people` table
 * and ensures they hold one active lifetime `member` credential.
 * Best-effort: callers wrap this in try/catch. A failure here must NOT
 * break the existing profiles-based activation that already succeeded.
 */
async function syncPersonAndCredential(
  supabase: ReturnType<typeof createClient>,
  args: {
    userId: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    stripeCustomerId: string | null;
    memberStatus: string;        // e.g. "active"
    smsConsent: boolean;
    smsConsentAt: string | null;
  }
) {
  const emailLower = args.email.toLowerCase().trim();

  // 1. Find existing person: by profile_id in metadata, else by email_lower.
  let personId: string | null = null;
  const { data: byProfile } = await supabase
    .from("people")
    .select("id")
    .filter("metadata->>profile_id", "eq", args.userId)
    .maybeSingle();
  personId = byProfile?.id ?? null;

  if (!personId) {
    const { data: byEmail } = await supabase
      .from("people")
      .select("id, metadata")
      .eq("email_lower", emailLower)
      .maybeSingle();
    if (byEmail) {
      personId = byEmail.id;
      // Backfill profile_id into metadata so future lookups match directly.
      const mergedMeta = { ...(byEmail.metadata ?? {}), profile_id: args.userId };
      await supabase.from("people").update({ metadata: mergedMeta }).eq("id", personId);
    }
  }

  // 2. If still no person, create one.
  if (!personId) {
    const { data: created, error: createErr } = await supabase
      .from("people")
      .insert({
        email: args.email,
        full_name: args.fullName,
        phone: args.phone,
        roles: ["member"],
        member_tier: "social",
        member_status: args.memberStatus,
        stripe_customer_id: args.stripeCustomerId,
        sms_consent: args.smsConsent,
        sms_consent_at: args.smsConsentAt,
        joined_at: new Date().toISOString(),
        metadata: { source: "stripe_webhook", profile_id: args.userId },
      })
      .select("id")
      .single();
    if (createErr) {
      log("syncPersonAndCredential: person insert failed", { error: createErr.message });
      return;
    }
    personId = created.id;
    log("syncPersonAndCredential: created person", { personId });
  } else {
    // 3. Person exists - update membership fields, ensure 'member' role present.
    const { data: existing } = await supabase
      .from("people")
      .select("roles")
      .eq("id", personId)
      .single();
    const roles: string[] = existing?.roles ?? [];
    if (!roles.includes("member")) roles.push("member");
    await supabase
      .from("people")
      .update({
        roles,
        member_status: args.memberStatus,
        stripe_customer_id: args.stripeCustomerId,
        ...(args.phone ? { phone: args.phone } : {}),
        ...(args.smsConsent ? { sms_consent: true, sms_consent_at: args.smsConsentAt } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", personId);
    log("syncPersonAndCredential: updated person", { personId });
  }

  // 4. Ensure one active lifetime member credential (event_id NULL).
  const { data: existingCred } = await supabase
    .from("attendance_credentials")
    .select("id")
    .eq("person_id", personId)
    .eq("credential_type", "member")
    .eq("status", "active")
    .is("event_id", null)
    .maybeSingle();

  if (existingCred) {
    log("syncPersonAndCredential: member credential already exists", { personId });
    return;
  }

  const tokenBytes = new Uint8Array(8);
  crypto.getRandomValues(tokenBytes);
  const token =
    "C-" +
    Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10).toUpperCase();

  const { error: credErr } = await supabase
    .from("attendance_credentials")
    .insert({
      token,
      person_id: personId,
      event_id: null,
      credential_type: "member",
      status: "active",
      wallet_status: "not_issued",
      metadata: { source: "stripe_webhook" },
    });

  if (credErr) {
    // 23505 = unique violation on one_active_member_credential_per_person.
    // Means a credential was created concurrently - that is fine, not an error.
    if ((credErr as { code?: string }).code === "23505") {
      log("syncPersonAndCredential: member credential already present (unique guard)", { personId });
    } else {
      log("syncPersonAndCredential: credential insert failed", { error: credErr.message });
    }
    return;
  }
  log("syncPersonAndCredential: issued member credential", { personId, token });
}

/**
 * Additive: void a cancelled member's active credentials in the new schema.
 * Best-effort - callers wrap in try/catch. A failure here must NOT break
 * the existing profiles-based cancellation that already succeeded.
 * Voids ALL active credentials for the person (the lifetime member pass and
 * any active future RSVPs). Past credentials are status='used' and untouched.
 */
async function voidPersonCredentials(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
) {
  // Resolve the person by their stripe_customer_id on the people row.
  const { data: person, error: personErr } = await supabase
    .from("people")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (personErr) {
    log("voidPersonCredentials: person lookup failed", { error: personErr.message });
    return;
  }
  if (!person) {
    log("voidPersonCredentials: no person matched stripe_customer_id - nothing to void", { stripeCustomerId });
    return;
  }

  const { data: voided, error: voidErr } = await supabase
    .from("attendance_credentials")
    .update({ status: "voided", updated_at: new Date().toISOString() })
    .eq("person_id", person.id)
    .eq("status", "active")
    .select("id");

  if (voidErr) {
    log("voidPersonCredentials: void update failed", { error: voidErr.message, personId: person.id });
    return;
  }

  // Mark the person canceled in the new schema too.
  await supabase
    .from("people")
    .update({
      member_status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", person.id);

  log("voidPersonCredentials: voided credentials", {
    personId: person.id,
    count: voided?.length ?? 0,
  });

  // Apple Wallet push: tell the member's installed pass to refresh so it
  // visibly flips to "Membership Inactive". Best-effort - a push failure
  // must never affect the cancellation. The pass serialNumber is the
  // profiles.id, so resolve it from the same stripe_customer_id.
  try {
    const { data: profileForPush } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    if (profileForPush?.id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("WALLET_PUSH_SECRET") ?? "";
      fetch(`${supabaseUrl}/functions/v1/send-apple-wallet-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ serialNumber: profileForPush.id }),
      }).catch((e: unknown) =>
        log("send-apple-wallet-push dispatch failed (non-blocking)", { error: String(e) }),
      );
      // Google Wallet update: PATCH the member's genericObject to
      // "Membership Inactive". Google propagates to all devices. Best-effort.
      fetch(`${supabaseUrl}/functions/v1/update-google-wallet-pass`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ serialNumber: profileForPush.id }),
      }).catch((e: unknown) =>
        log("update-google-wallet-pass dispatch failed (non-blocking)", { error: String(e) }),
      );
      log("Apple Wallet push dispatched", { serialNumber: profileForPush.id });
    } else {
      log("voidPersonCredentials: no profile for stripe_customer_id, skipping wallet push", { stripeCustomerId });
    }
  } catch (pushErr) {
    log("voidPersonCredentials: wallet push block threw (non-blocking)", {
      error: pushErr instanceof Error ? pushErr.message : String(pushErr),
    });
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
  const customerPhone = session.customer_details?.phone || null;

  // ── SMS consent (A2P 10DLC): captured at /join checkout time and forwarded
  // through Stripe Checkout Session metadata. Stripe metadata values are
  // strings; "true"/"false" come back exactly as we sent them.
  const smsConsentFromMeta = session.metadata?.sms_consent === "true";
  const smsConsentAtFromMeta = session.metadata?.sms_consent_at || null;
  const smsConsentUserAgentFromMeta = session.metadata?.sms_consent_user_agent || null;
  const consentFields: Record<string, unknown> = {
    sms_consent: smsConsentFromMeta,
    sms_consent_at: smsConsentFromMeta
      ? (smsConsentAtFromMeta || new Date().toISOString())
      : null,
    // user_agent is best-effort: Stripe metadata caps each value at 500 chars,
    // and most browser UA strings exceed that — so this is typically null and
    // the audit-grade UA is recorded on the contacts row at capture-prospect time.
    sms_consent_user_agent:
      smsConsentFromMeta && smsConsentUserAgentFromMeta
        ? smsConsentUserAgentFromMeta
        : null,
  };

  // ── Phase A: Product Identification ──────────────────────────────────

  const socialProductId = Deno.env.get("STRIPE_SOCIAL_PRODUCT_ID");
  if (!socialProductId) {
    log("WARNING: STRIPE_SOCIAL_PRODUCT_ID not set - skipping onboarding pipeline (fail-safe)");
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
    log("Social Membership checkout - running onboarding pipeline", { email: customerEmail });

    // Check for existing profile (including soft-deleted)
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", customerEmail.toLowerCase());

    const activeProfile = allProfiles?.find((p: any) => !p.deleted_at);
    const softDeletedProfile = allProfiles?.find((p: any) => p.deleted_at);

    if (activeProfile) {
      userId = activeProfile.id;

      // Distinguish genuine existing paying member from a shell profile
      // created by the auth signup trigger that is now being activated
      // by first payment. Without this check, the signup trigger's shell
      // profile causes ALL new paying members to be misclassified as
      // "existing_active" and skip the welcome onboarding.
      const wasAlreadyPaying =
        activeProfile.subscription_status === "active" ||
        activeProfile.subscription_status === "trialing";

      memberAction = wasAlreadyPaying ? "existing_active" : "new";

      log(
        wasAlreadyPaying
          ? "Updating existing active profile"
          : "Activating shell profile for new paying member",
        { userId, previousStatus: activeProfile.subscription_status }
      );

      const mt = activeProfile.member_type as string | null | undefined;
      const updates: Record<string, unknown> = {
        subscription_status: "active",
        stripe_customer_id: stripeCustomerId,
        subscription_id: subscriptionId,
        cancel_at_period_end: false,
        ...(customerPhone ? { phone: customerPhone } : {}),
        ...consentFields,
      };
      // Social checkout: ensure member_type social when not business/partner
      if (
        mt !== "business" &&
        mt !== "partner" &&
        (!mt || mt === "social_non_member" || mt === "non_member" || mt === "social")
      ) {
        updates.member_type = "social";
      }
      if (!activeProfile.member_since) {
        updates.member_since = new Date().toISOString();
      }
      if (!activeProfile.first_payment_at) {
        updates.first_payment_at = new Date().toISOString();
      }

      await supabase.from("profiles").update(updates).eq("id", userId);

      // If this is effectively a new member (shell profile being activated
      // by first payment), run the same onboarding steps that the brand-new
      // branch runs — user_roles upsert and welcome feed post.
      if (!wasAlreadyPaying) {
        await supabase.from("user_roles").upsert(
          { user_id: userId!, role: "member" },
          { onConflict: "user_id,role" }
        );
        try {
          await insertNewSocialMemberWelcomePost(supabase, userId!, customerName);
        } catch (postErr) {
          log("Welcome post insert failed (non-fatal)", { error: String(postErr) });
        }
      }
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
          cancel_at_period_end: false,
          ...(customerPhone ? { phone: customerPhone } : {}),
          ...consentFields,
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
          member_type: "social",
          subscription_status: "active",
          subscription_id: subscriptionId,
          stripe_customer_id: stripeCustomerId,
          member_since: new Date().toISOString(),
          ...(customerPhone ? { phone: customerPhone } : {}),
          ...consentFields,
        },
        { onConflict: "id" }
      );

      if (profileErr) {
        log("Profile upsert error, trying update", { error: profileErr.message });
        await supabase
          .from("profiles")
          .update({
            member_type: "social",
            subscription_status: "active",
            subscription_id: subscriptionId,
            stripe_customer_id: stripeCustomerId,
            member_since: new Date().toISOString(),
            full_name: customerName,
            ...consentFields,
          })
          .eq("id", userId!);
      }

      await supabase
        .from("user_roles")
        .upsert({ user_id: userId!, role: "member" }, { onConflict: "user_id,role" });

      await insertNewSocialMemberWelcomePost(supabase, userId!, customerName);

      const { error: resetErr } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: customerEmail,
      });
      if (resetErr) log("Password reset link error (non-blocking)", { error: resetErr.message });
      else log("Password recovery link generated");
    }

    // ── Ambassador referral tracking ──
    // Runs after the profile is created/updated and before the welcome email.
    // Best-effort: any failure here is logged but does not block the rest of
    // the checkout pipeline (the member should still get their welcome email
    // even if referral attribution silently fails — admins can backfill later).
    console.log("[AMB-DIAG] Entering ambassador attribution", {
      sessionId: session.id,
      metadataPresent: !!session.metadata,
      metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
      ambassadorIdFromMeta: session.metadata?.ambassador_id || null,
      referralCodeFromMeta: session.metadata?.referral_code || null,
      ambassadorTierFromMeta: session.metadata?.ambassador_tier || null,
      userId: userId,
      customerEmail,
    });
    const ambassadorIdFromMeta = session.metadata?.ambassador_id || null;
    const referralCodeFromMeta = session.metadata?.referral_code || null;
    const ambassadorTierFromMeta = session.metadata?.ambassador_tier || "social";

    if (ambassadorIdFromMeta && userId) {
      try {
        // Re-validate ambassador (defense in depth — metadata could be stale
        console.log("[AMB-DIAG] Inside if block, querying ambassadors table");
        // by the time the webhook fires).
        const { data: amb } = await supabase
          .from("ambassadors")
          .select("id, email, social_reward_cents, business_reward_cents, is_active")
          .eq("id", ambassadorIdFromMeta)
          .eq("is_active", true)
          .maybeSingle();

        if (!amb) {
          log("Ambassador not found or inactive on referral creation", { ambassadorIdFromMeta });
          console.log("[AMB-DIAG] Ambassador NOT found by id+is_active query", {
            ambassadorIdFromMeta,
          });
        } else {
          const ambRow = amb as {
            id: string;
            email: string | null;
            social_reward_cents: number;
            business_reward_cents: number;
          };
          console.log("[AMB-DIAG] Ambassador found:", {
            ambId: ambRow.id,
            ambEmail: ambRow.email,
          });

          const rewardCents = ambassadorTierFromMeta === "business"
            ? ambRow.business_reward_cents
            : ambRow.social_reward_cents;

          // Anti-abuse signals — light-weight checks that admins can review
          // before approving the referral.
          const flags: Record<string, boolean> = {};
          // Stripe Checkout sessions don't expose the cardholder fingerprint
          // directly; we'd need to inflate the payment_intent.charges to get
          // it. Defer card-level fraud checks to admin review for now.
          const paymentMethodFingerprint: string | null = null;

          const hasFlags = Object.keys(flags).length > 0;
          const initialStatus = hasFlags ? "flagged_self_refer" : "signed_up";

          console.log("[AMB-DIAG] About to INSERT ambassador_referrals row", {
            ambassador_id: ambRow.id,
            referred_user_id: userId,
            referred_email: customerEmail,
            tier: ambassadorTierFromMeta,
            status: initialStatus,
            reward_cents: rewardCents,
          });
          const { data: refRow, error: refErr } = await supabase
            .from("ambassador_referrals")
            .insert({
              ambassador_id: ambRow.id,
              referred_user_id: userId,
              referred_email: customerEmail,
              referred_full_name: customerName || null,
              tier: ambassadorTierFromMeta,
              reward_cents: rewardCents,
              status: initialStatus,
              payment_method_fingerprint: paymentMethodFingerprint,
              abuse_flags: flags,
              stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
              stripe_session_id: session.id,
              signed_up_at: new Date().toISOString(),
              payout_status: "pending",
            })
            .select("id")
            .single();

          if (refErr) {
            console.log("[AMB-DIAG] INSERT FAILED:", {
              error: refErr.message,
              code: (refErr as { code?: string }).code,
              details: (refErr as { details?: string }).details,
              hint: (refErr as { hint?: string }).hint,
            });
            log("Failed to insert ambassador referral", { error: refErr.message });
          } else if (refRow) {
            // Stamp the linkage + locked-in pricing flag on the profile so
            console.log("[AMB-DIAG] INSERT SUCCEEDED:", { referralId: refRow.id });
            // downstream admin tooling can see who referred whom.
            await supabase
              .from("profiles")
              .update({
                referred_by_ambassador_id: ambRow.id,
                ambassador_referral_id: refRow.id,
                is_locked_in_pricing: true,
              })
              .eq("id", userId);

            log("Ambassador referral created", {
              referral_id: refRow.id,
              status: initialStatus,
              ambassador_id: ambRow.id,
              code: referralCodeFromMeta,
            });

            // ── Fire ambassador emails (non-blocking) ──
            // 1. Notify the ambassador that a new member signed up via their code.
            // 2. Notify hello@ for admin oversight.
            try {
              const supabaseUrl2 = Deno.env.get("SUPABASE_URL") ?? "";
              const sendEmailUrl = `${supabaseUrl2}/functions/v1/send-email`;
              const authHeader2 = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
              const productionUrl = "https://704collective.com";

              const { data: ambFull } = await supabase
                .from("ambassadors")
                .select("full_name, email, referral_code")
                .eq("id", ambRow.id)
                .single();

              if (ambFull) {
                const rewardDollarsStr = (rewardCents / 100).toFixed(2);

                // Email 1 — ambassador notification
                fetch(sendEmailUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: authHeader2 },
                  body: JSON.stringify({
                    to: ambFull.email,
                    template: "ambassador-referral-received",
                    skipCc: true,
                    data: {
                      ambassadorName: ambFull.full_name,
                      referredName: customerName || customerEmail,
                      tier: ambassadorTierFromMeta,
                      code: ambFull.referral_code,
                      rewardDollars: rewardDollarsStr,
                      status: initialStatus,
                      leaderboardUrl: `${productionUrl}/ambassadors/leaderboard`,
                    },
                  }),
                }).catch((e: unknown) =>
                  log("ambassador-referral-received email failed", { error: String(e) })
                );

                // Email 2 — hello@ admin notification
                fetch(sendEmailUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: authHeader2 },
                  body: JSON.stringify({
                    to: "hello@704collective.com",
                    template: "ambassador-admin-notification",
                    skipCc: true,
                    data: {
                      ambassadorName: ambFull.full_name,
                      code: ambFull.referral_code,
                      referredName: customerName || customerEmail,
                      referredEmail: customerEmail,
                      tier: ambassadorTierFromMeta,
                      rewardDollars: rewardDollarsStr,
                      status: initialStatus,
                      adminQueueUrl: `${productionUrl}/admin/ambassadors`,
                    },
                  }),
                }).catch((e: unknown) =>
                  log("ambassador-admin-notification email failed", { error: String(e) })
                );
              }
            } catch (emailErr) {
              log("Ambassador email dispatch failed (non-blocking)", { error: String(emailErr) });
            }
          }
        }
      } catch (refError) {
        const msg = refError instanceof Error ? refError.message : String(refError);
        console.log("[AMB-DIAG] EXCEPTION caught:", {
          error: msg,
          stack: refError instanceof Error ? refError.stack : null,
        });
        log("Ambassador referral processing failed (non-blocking)", { error: msg });
      }
    } else {
      console.log("[AMB-DIAG] Skipped if block - missing ambassadorIdFromMeta or userId", {
        hasAmbassadorId: !!ambassadorIdFromMeta,
        hasUserId: !!userId,
      });
    }

    // ── Welcome email (only for new or reactivated) ──
    // New members now set their password during signup on /join, so we always
    // send the regular welcome email — no recovery link generation needed.
    if (memberAction === "new" || memberAction === "reactivated") {
      try {
        const { data: profileForEmail } = await supabase
          .from("profiles")
          .select("calendar_token")
          .eq("id", userId!)
          .single();

        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const calendarToken = profileForEmail?.calendar_token ?? "";
        const calendarUrl = `webcal://${supabaseUrl.replace("https://", "")}/functions/v1/calendar-feed?token=${calendarToken}`;

        const PRODUCTION_URL = "https://704collective.com";
        const sessionOrigin = session.metadata?.origin || PRODUCTION_URL;
        if (!session.metadata?.origin) {
          log("No origin in session metadata, using production URL fallback", { origin: sessionOrigin });
        }

        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ to: customerEmail, template: memberAction === "reactivated" ? "welcome-back" : "welcome-new", data: { name: customerName || "there", calendarUrl, origin: sessionOrigin } }),
        });

        log("Welcome email sent", { email: customerEmail, memberAction });
      } catch (emailErr) {
        const emailMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        log("Welcome email failed (non-blocking)", { error: emailMsg });
      }
    } else {
      log("Skipping welcome email for existing active member", { userId });
    }
    // Additive: sync this member into the new people/attendance_credentials schema.
    // Best-effort - must not break the profiles-based activation above.
    if (userId) {
      try {
        await syncPersonAndCredential(supabase, {
          userId,
          email: customerEmail,
          fullName: customerName || null,
          phone: customerPhone,
          stripeCustomerId,
          memberStatus: "active",
          smsConsent: smsConsentFromMeta,
          smsConsentAt: consentFields.sms_consent_at as string | null,
        });
      } catch (syncErr) {
        log("syncPersonAndCredential threw (non-blocking)", {
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }
  } else {
    log("Non-social checkout - skipping onboarding pipeline", { lineItemName });
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

  // Skip the first invoice for a new subscription — checkout.session.completed already logged it
  const billingReason = (invoice as any).billing_reason;
  if (billingReason === "subscription_create") {
    log("Skipping payment insert for subscription_create invoice (already logged by checkout)", { stripeCustomerId });
  }

  const profile = await findProfileByCustomerId(supabase, stripeCustomerId);

  if (profile) {
    const periodEnd = invoice.lines?.data?.[0]?.period?.end;
    const updates: Record<string, unknown> = {
      subscription_status: "active",
      cancel_at_period_end: false,
    };
    if (periodEnd) {
      updates.subscription_ends_at = new Date(periodEnd * 1000).toISOString();
    }
    await supabase.from("profiles").update(updates).eq("id", profile.id);
    log("Profile updated to active", { userId: profile.id });

    // Sweep-aware: also update people.member_status to keep new-schema canonical in sync.
    // Best-effort - never block the profile update path.
    try {
      const { data: personRow } = await supabase
        .from("people")
        .select("id, member_status")
        .filter("metadata->>profile_id", "eq", profile.id)
        .maybeSingle();
      if (personRow) {
        await supabase
          .from("people")
          .update({ member_status: "active", updated_at: new Date().toISOString() })
          .eq("id", personRow.id);
        log("People row synced to active", { personId: personRow.id, source: "invoice.payment_succeeded" });
      } else {
        log("No people row found for profile, skipping sync", { profileId: profile.id, source: "invoice.payment_succeeded" });
      }
    } catch (syncErr) {
      log("People sync failed (non-blocking)", { error: syncErr instanceof Error ? syncErr.message : String(syncErr), source: "invoice.payment_succeeded" });
    }

    // Only log payment for renewals, not the initial subscription (checkout already logged it)
    if (billingReason !== "subscription_create") {
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
    }
  } else {
    log("WARNING: No profile found for invoice.payment_succeeded", { stripeCustomerId });
  }

  // Ambassador referral conversion tracking
  // Trigger: 2nd invoice (first full billing cycle paid)
  // billing_reason === 'subscription_cycle' indicates a renewal invoice
  try {
    const subscriptionId = typeof invoice.subscription === "string"
      ? invoice.subscription
      : null;

    if (billingReason === "subscription_cycle" && subscriptionId) {
      const { data: refRow, error: refLookupErr } = await supabase
        .from("ambassador_referrals")
        .select("id, status")
        .eq("stripe_subscription_id", subscriptionId)
        .eq("status", "signed_up")
        .maybeSingle();

      if (refLookupErr) {
        log("Ambassador referral lookup failed on conversion", {
          error: refLookupErr.message,
        });
      } else if (refRow) {
        const { error: convErr } = await supabase
          .from("ambassador_referrals")
          .update({
            status: "converted",
            converted_at: new Date().toISOString(),
            payout_status: "owed",
          })
          .eq("id", refRow.id)
          .eq("status", "signed_up");  // Idempotency guard

        if (convErr) {
          log("Ambassador referral conversion update failed", {
            referralId: refRow.id,
            error: convErr.message,
          });
        } else {
          log("Ambassador referral converted", {
            referralId: refRow.id,
            subscriptionId,
          });
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("Ambassador conversion processing failed (non-blocking)", {
      error: msg,
    });
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

    // Sweep-aware: also update people.member_status to past_due.
    try {
      const { data: personRow } = await supabase
        .from("people")
        .select("id")
        .filter("metadata->>profile_id", "eq", profile.id)
        .maybeSingle();
      if (personRow) {
        await supabase
          .from("people")
          .update({ member_status: "past_due", updated_at: new Date().toISOString() })
          .eq("id", personRow.id);
        log("People row synced to past_due", { personId: personRow.id, source: "invoice.payment_failed" });
      }
    } catch (syncErr) {
      log("People sync failed (non-blocking)", { error: syncErr instanceof Error ? syncErr.message : String(syncErr), source: "invoice.payment_failed" });
    }

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
      .update({
        subscription_status: "canceled",
        subscription_id: null,
        cancel_at_period_end: false,
        canceled_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    log("Subscription canceled", { userId: profile.id });

    // Sweep-aware: also update people.member_status to inactive + stamp canceled_at.
    try {
      const { data: personRow } = await supabase
        .from("people")
        .select("id")
        .filter("metadata->>profile_id", "eq", profile.id)
        .maybeSingle();
      if (personRow) {
        await supabase
          .from("people")
          .update({
            member_status: "inactive",
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", personRow.id);
        log("People row synced to inactive", { personId: personRow.id, source: "subscription.deleted" });
      }
    } catch (syncErr) {
      log("People sync failed (non-blocking)", { error: syncErr instanceof Error ? syncErr.message : String(syncErr), source: "subscription.deleted" });
    }
  } else {
    log("WARNING: No profile found for subscription.deleted", { stripeCustomerId });
  }

    // Additive: void this person's credentials in the new schema.
    // Best-effort - must not break the profiles cancellation above.
    try {
      await voidPersonCredentials(supabase, stripeCustomerId);
    } catch (voidErr) {
      log("voidPersonCredentials threw (non-blocking)", {
        error: voidErr instanceof Error ? voidErr.message : String(voidErr),
      });
    }

  // Ambassador referral churn tracking
  // If subscription cancels BEFORE conversion, mark referral as churned.
  // Already-converted referrals are NOT churned (they earned their commission already).
  try {
    const { data: refRow, error: refLookupErr } = await supabase
      .from("ambassador_referrals")
      .select("id, status")
      .eq("stripe_subscription_id", subscription.id)
      .eq("status", "signed_up")
      .maybeSingle();

    if (refLookupErr) {
      log("Ambassador referral churn lookup failed", {
        error: refLookupErr.message,
      });
    } else if (refRow) {
      const { error: churnErr } = await supabase
        .from("ambassador_referrals")
        .update({ status: "churned" })
        .eq("id", refRow.id)
        .eq("status", "signed_up");  // Idempotency

      if (churnErr) {
        log("Ambassador referral churn update failed", {
          referralId: refRow.id,
          error: churnErr.message,
        });
      } else {
        log("Ambassador referral churned (cancelled before conversion)", {
          referralId: refRow.id,
          subscriptionId: subscription.id,
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("Ambassador churn processing failed (non-blocking)", {
      error: msg,
    });
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
      cancel_at_period_end: subscription.cancel_at_period_end === true,
    };
    // In Basil API, current_period_end moved to item level
    const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
    if (typeof itemPeriodEnd === "number") {
      updates.subscription_ends_at = new Date(itemPeriodEnd * 1000).toISOString();
    } else if (typeof itemPeriodEnd === "string") {
      updates.subscription_ends_at = new Date(itemPeriodEnd).toISOString();
    }
    // Stamp canceled_at when Stripe reports the subscription as canceled.
    if (mappedStatus === "canceled") {
      updates.canceled_at = new Date().toISOString();
    }
    await supabase.from("profiles").update(updates).eq("id", profile.id);
    log("Subscription status synced", { userId: profile.id, status: mappedStatus });

    // Sweep-aware: also update people.member_status with the mapped status.
    // Map past_due/canceled/active to people-side values.
    try {
      const peopleStatus = mappedStatus === "canceled" ? "inactive" : mappedStatus;
      const peopleUpdates: Record<string, unknown> = {
        member_status: peopleStatus,
        updated_at: new Date().toISOString(),
      };
      if (mappedStatus === "canceled") {
        peopleUpdates.canceled_at = new Date().toISOString();
      }
      const { data: personRow } = await supabase
        .from("people")
        .select("id")
        .filter("metadata->>profile_id", "eq", profile.id)
        .maybeSingle();
      if (personRow) {
        await supabase
          .from("people")
          .update(peopleUpdates)
          .eq("id", personRow.id);
        log("People row synced", { personId: personRow.id, peopleStatus, source: "subscription.updated" });
      }
    } catch (syncErr) {
      log("People sync failed (non-blocking)", { error: syncErr instanceof Error ? syncErr.message : String(syncErr), source: "subscription.updated" });
    }
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

    // Route to handler. If a handler throws, delete the processed marker
    // so Stripe's retry re-runs the handler (the marker was inserted upfront
    // for atomic idempotency; on failure it must be rolled back manually).
    try {
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
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const ambassadorId = account.metadata?.ambassador_id;
        if (!ambassadorId) {
          log("account.updated event without ambassador_id metadata, ignoring", { account_id: account.id });
          break;
        }
        let newStatus = 'onboarding';
        if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
          newStatus = 'active';
        } else if (account.requirements?.disabled_reason) {
          newStatus = 'restricted';
        }
        const updates: Record<string, unknown> = { stripe_account_status: newStatus };
        if (newStatus === 'active') {
          // Only stamp the completion time once; fetch current value first.
          const { data: ambRow } = await supabase
            .from('ambassadors')
            .select('stripe_onboarding_completed_at')
            .eq('id', ambassadorId)
            .maybeSingle();
          if (!ambRow?.stripe_onboarding_completed_at) {
            updates.stripe_onboarding_completed_at = new Date().toISOString();
          }
        }
        const { error: updErr } = await supabase
          .from('ambassadors')
          .update(updates)
          .eq('id', ambassadorId);
        if (updErr) {
          log("Failed to update ambassador status from account.updated", { ambassadorId, error: updErr.message });
        } else {
          log("Ambassador Stripe account status updated", { ambassadorId, status: newStatus });
        }
        break;
      }
      default:
        log("Unhandled event type", { type: event.type });
        break;
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
    console.error("[STRIPE-WEBHOOK] Internal error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
