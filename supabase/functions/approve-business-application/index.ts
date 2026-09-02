import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePerson } from "../_shared/resolvePerson.ts";

/** Member-to-member business referral reward, in cents. */
const MEMBER_REFERRAL_AMOUNT_CENTS = 25000;
/** Ambassador reward for a business signup, in cents. */
const AMBASSADOR_BUSINESS_REWARD_CENTS = 12500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomPublicId12(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * approve-business-application
 *
 * Called from AdminApplicationsTab when admin clicks "Approve & Charge".
 * All DB writes are deferred to the end so that any Stripe failure leaves the
 * application in 'pending' state and the admin can safely retry.
 *
 * Flow:
 *  1.  Load application; idempotency-guard against double-approval
 *  2.  Load profile by profile_id (canonical link set at signup)
 *  3.  Retrieve SetupIntent and validate card was saved
 *  4.  Set saved card as customer's default payment method
 *  5.  Determine business price from billing_plan
 *  6.  If existing social member: calculate real proration, cancel social sub
 *  7.  Optionally create one-time coupon for proration credit
 *  8.  Create business subscription with explicit payment method
 *  9.  Validate subscription succeeded
 * 10.  Update profile (member_type, subscription_id, etc.)
 * 11.  Ensure business_card row exists
 * 12.  Insert welcome posts on social + business feeds
 * 13.  Update application row last (status, approved_at, stripe_subscription_id, …)
 * 14.  Send approval email
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authorization: super_admin only - this function charges cards
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authedUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authedUser?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: authedProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authedUser.id)
      .maybeSingle();
    if (!authedProfile || authedProfile.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://704collective.com";

    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: "application_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[APPROVE] Starting approval for application:", application_id);

    // ── Step 1: Load application ─────────────────────────────────────────────
    const { data: app, error: appErr } = await supabase
      .from("business_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[APPROVE] Application loaded:", app.id, "status:", app.status, "email:", app.email);

    // ── Step 2: Idempotency guard ────────────────────────────────────────────
    if (app.status !== "pending") {
      console.log("[APPROVE] Refusing to re-approve - current status:", app.status);
      return new Response(
        JSON.stringify({ error: `Application is already ${app.status} - cannot approve again` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-verified card gate. The admin UI hides Approve until card_saved
    // is true; this refuses the same case if anyone calls the function directly.
    if (app.card_saved !== true) {
      console.log("[APPROVE] Refusing - card_saved is not true");
      return new Response(
        JSON.stringify({ error: "Card has not been saved on this application - cannot approve" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 3: Load profile by profile_id ──────────────────────────────────
    if (!app.profile_id) {
      throw new Error("Application has no profile_id - cannot locate the applicant's account");
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", app.profile_id)
      .single();

    if (profileErr || !profile) {
      throw new Error(`Profile not found for profile_id ${app.profile_id} - applicant account may be missing`);
    }

    console.log("[APPROVE] Profile found:", profile.id, "member_type:", profile.member_type, "sub_status:", profile.subscription_status);

    // ── Step 4: Resolve Stripe customer ID ──────────────────────────────────
    const stripeCustomerId: string | null = profile.stripe_customer_id ?? app.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      throw new Error("No Stripe customer ID found on profile or application - card setup may be incomplete");
    }

    console.log("[APPROVE] stripeCustomerId:", stripeCustomerId);

    // ── Step 5: Retrieve SetupIntent and validate saved card ─────────────────
    if (!app.stripe_setup_intent_id) {
      throw new Error("No SetupIntent ID found on application - card was never saved");
    }

    console.log("[APPROVE] Retrieving SetupIntent:", app.stripe_setup_intent_id);

    const siRes = await fetch(
      `https://api.stripe.com/v1/setup_intents/${app.stripe_setup_intent_id}?expand[]=payment_method`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const setupIntent = await siRes.json();

    const pmRaw = setupIntent.payment_method;
    console.log("[APPROVE] SetupIntent status:", setupIntent.status, "payment_method:", typeof pmRaw === "object" ? pmRaw?.id : pmRaw);

    if (setupIntent.status !== "succeeded" || !pmRaw) {
      throw new Error(
        `Card was not saved successfully - SetupIntent status is '${setupIntent.status}' (expected 'succeeded')`
      );
    }

    const paymentMethodId: string = typeof pmRaw === "string" ? pmRaw : pmRaw.id;
    console.log("[APPROVE] paymentMethodId:", paymentMethodId);

    // ── Step 6: Set payment method as customer's default ─────────────────────
    console.log("[APPROVE] Setting default payment method on customer");
    const custUpdateRes = await fetch(
      `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "invoice_settings[default_payment_method]": paymentMethodId,
        }).toString(),
      }
    );
    const custUpdate = await custUpdateRes.json();
    console.log("[APPROVE] Customer default PM set:", custUpdate.invoice_settings?.default_payment_method);

    // ── Step 7: Determine business price ID ──────────────────────────────────
    const billingPlan = app.billing_plan ?? "monthly";
    const businessPriceId =
      billingPlan === "annual"
        ? (Deno.env.get("STRIPE_BUSINESS_ANNUAL_PRICE_ID") ?? "")
        : (Deno.env.get("STRIPE_BUSINESS_PRICE_ID") ?? "");

    if (!businessPriceId) {
      throw new Error(`Business price ID not configured in environment for billing_plan='${billingPlan}'`);
    }

    console.log("[APPROVE] billingPlan:", billingPlan, "businessPriceId:", businessPriceId);

    // Fetch the business price so we can cap any proration credit
    const bPriceRes = await fetch(
      `https://api.stripe.com/v1/prices/${businessPriceId}`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const bPrice = await bPriceRes.json();
    const businessPriceAmount: number = bPrice.unit_amount ?? 30000;
    console.log("[APPROVE] businessPriceAmount:", businessPriceAmount, "cents");

    // ── Step 8: Proration for existing social member ─────────────────────────
    let proratedCredit = 0;
    let couponId: string | null = null;

    if (
      profile.member_type === "social" &&
      profile.subscription_status === "active" &&
      profile.subscription_id
    ) {
      console.log("[APPROVE] Active social member detected - fetching subscription for proration:", profile.subscription_id);

      const stripeRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${profile.subscription_id}?expand[]=items.data.price`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
      );
      const stripeSub = await stripeRes.json();

      console.log(
        "[APPROVE] Social sub status:", stripeSub.status,
        "period:", stripeSub.current_period_start, "→", stripeSub.current_period_end
      );

      if (stripeSub.current_period_start && stripeSub.current_period_end) {
        const nowSec = Math.floor(Date.now() / 1000);
        const periodStart: number = stripeSub.current_period_start;
        const periodEnd: number = stripeSub.current_period_end;
        const totalDaysInPeriod = (periodEnd - periodStart) / 86400;
        const daysRemaining = Math.max(0, (periodEnd - nowSec) / 86400);

        // Use the actual subscription unit_amount rather than a hardcoded price
        const firstItem = stripeSub.items?.data?.[0];
        const unitAmount: number = firstItem?.price?.unit_amount ?? 3000;
        console.log(
          "[APPROVE] Social sub unit_amount:", unitAmount,
          "totalDaysInPeriod:", totalDaysInPeriod.toFixed(2),
          "daysRemaining:", daysRemaining.toFixed(2)
        );

        const dailyRate = unitAmount / totalDaysInPeriod;
        proratedCredit = Math.round(dailyRate * daysRemaining);
        // Cap: coupon must never equal or exceed the new charge
        proratedCredit = Math.min(proratedCredit, businessPriceAmount - 1);
        console.log("[APPROVE] proratedCredit (after cap):", proratedCredit, "cents");

        // Cancel social subscription with prorate=true
        console.log("[APPROVE] Cancelling social subscription:", profile.subscription_id);
        const cancelRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${profile.subscription_id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "prorate=true",
          }
        );
        const cancelResult = await cancelRes.json();
        console.log("[APPROVE] Social sub cancelled, status:", cancelResult.status);
      } else {
        console.log("[APPROVE] Social sub has no period data - skipping proration");
      }
    }

    // ── Step 9: Create proration coupon ──────────────────────────────────────
    if (proratedCredit > 0) {
      console.log("[APPROVE] Creating proration coupon for", proratedCredit, "cents");
      const couponRes = await fetch("https://api.stripe.com/v1/coupons", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          amount_off: proratedCredit.toString(),
          currency: "usd",
          duration: "once",
          name: "Social membership proration credit",
        }).toString(),
      });
      const coupon = await couponRes.json();
      if (coupon.id) {
        couponId = coupon.id;
        console.log("[APPROVE] Coupon created:", couponId);
      } else {
        console.error("[APPROVE] Coupon creation failed:", JSON.stringify(coupon));
      }
    }

    // ── Step 10: Create business subscription ────────────────────────────────
    // A prior attempt may already have an active business sub (charge succeeded,
    // a later DB write failed). Reuse it. Never bill the same card twice.
    // deno-lint-ignore no-explicit-any
    let sub: any = null;
    const existingListRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=active&limit=10`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const existingList = await existingListRes.json();
    const reusable = (existingList.data ?? []).find((s: { items?: { data?: Array<{ price?: { id?: string } }> } }) =>
      (s.items?.data ?? []).some((it) => it.price?.id === businessPriceId)
    );
    if (reusable) {
      sub = reusable;
      console.log("[APPROVE] Reusing existing active business subscription:", reusable.id);
    } else {
      console.log("[APPROVE] Creating business subscription - customer:", stripeCustomerId, "price:", businessPriceId);

      const subBody = new URLSearchParams({
        customer: stripeCustomerId,
        "items[0][price]": businessPriceId,
        default_payment_method: paymentMethodId,
        payment_behavior: "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
      });
      // expand latest_invoice.payment_intent so we can inspect the charge result
      subBody.append("expand[]", "latest_invoice.payment_intent");
      if (couponId) subBody.set("coupon", couponId);

      const subRes = await fetch("https://api.stripe.com/v1/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: subBody.toString(),
      });
      sub = await subRes.json();
    }

    const invoiceId =
      typeof sub.latest_invoice === "string"
        ? sub.latest_invoice
        : sub.latest_invoice?.id ?? null;
    let piStatus = sub.latest_invoice?.payment_intent?.status ?? "unknown";
    console.log(
      "[APPROVE] Subscription response - id:", sub.id,
      "status:", sub.status,
      "invoice:", invoiceId,
      "invoice pi_status:", piStatus
    );

    // ── Step 11: Validate subscription result ────────────────────────────────
    const newSubscriptionId: string | null = sub.id ?? null;

    if (!newSubscriptionId) {
      throw new Error(`Stripe did not return a subscription ID. Response: ${JSON.stringify(sub)}`);
    }

    // Stripe's 2025+ invoice object no longer hangs payment_intent on the
    // invoice root. default_incomplete therefore returns status 'incomplete'
    // with an open $300 invoice that still has to be collected. Pay it with
    // the card already on the customer — same $300 charge, same proration
    // coupon if one was attached. Amount and price id are untouched.
    if (sub.status !== "active" && sub.status !== "trialing" && invoiceId) {
      console.log("[APPROVE] Collecting first invoice:", invoiceId);
      const payRes = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ off_session: "true" }).toString(),
      });
      const paid = await payRes.json();
      console.log("[APPROVE] Invoice pay status:", paid.status, "paid:", paid.amount_paid);

      const subRefresh = await fetch(
        `https://api.stripe.com/v1/subscriptions/${newSubscriptionId}`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
      );
      sub = await subRefresh.json();
      piStatus = paid.status ?? piStatus;
      console.log("[APPROVE] Subscription after invoice pay:", sub.status);
    }

    if (sub.status !== "active" && sub.status !== "trialing") {
      if (piStatus === "requires_action") {
        throw new Error(
          "Card requires authentication - applicant needs to re-confirm their card before approval"
        );
      }
      throw new Error(
        `Subscription creation failed with status '${sub.status}' (payment_intent status: ${piStatus})`
      );
    }

    console.log("[APPROVE] Subscription is active:", newSubscriptionId);

    // ── Step 12: Update profile ──────────────────────────────────────────────
    // These are the fields the member portal actually gates on: member_type
    // decides the business experience, subscription_status decides active
    // access, and application_status must stop being 'pending' or middleware
    // keeps redirecting to /pending-review.
    const nowIso = new Date().toISOString();

    console.log("[APPROVE] Updating profile:", profile.id);
    const profileUpdates: Record<string, unknown> = {
      member_type: "business",
      subscription_status: "active",
      stripe_customer_id: stripeCustomerId,
      subscription_id: newSubscriptionId,
      // profiles.application_status vocabulary is accepted/denied/waitlist/pending.
      // business_applications.status uses approved; the sync trigger maps it.
      application_status: "accepted",
      // Set once, on the day they actually became a member.
      ...(profile.member_since ? {} : { member_since: nowIso }),
    };
    const { error: profileUpdateErr } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("id", profile.id);
    if (profileUpdateErr) {
      console.error("[APPROVE] Profile update error:", profileUpdateErr.message);
      throw new Error(`Failed to update profile: ${profileUpdateErr.message}`);
    }

    // ── Step 12b: people row ─────────────────────────────────────────────────
    // Same convention as the shipped paying-member path in stripe-webhook: the
    // shared resolver owns find-or-create, so an existing person is adopted and
    // healed rather than duplicated, and auth_user_id is the link (the mirror
    // trigger fills metadata.profile_id from it). Non-blocking: the member is
    // already provisioned and paid, and a missing people row is a fixable state.
    let personId: string | null = null;
    try {
      const resolved = await resolvePerson(supabase, {
        authUserId: profile.id,
        email: profile.email ?? app.email,
        profile: {
          id: profile.id,
          email: profile.email ?? app.email,
          full_name: profile.full_name ?? `${app.first_name} ${app.last_name}`.trim(),
          phone: profile.phone ?? app.phone,
          member_type: "business",
          subscription_status: "active",
        },
        nameHint: `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim() || undefined,
        phoneHint: app.phone ?? undefined,
        source: "approve_business_application",
        mint: true,
      });

      personId = resolved.personId;
      console.log("[APPROVE] people resolve:", { personId, via: resolved.via, healed: resolved.healed });

      if (personId) {
        const { data: existingPerson } = await supabase
          .from("people")
          .select("roles")
          .eq("id", personId)
          .maybeSingle();

        const roles: string[] = existingPerson?.roles ?? [];
        if (!roles.includes("member")) roles.push("member");

        const { error: personStampErr } = await supabase
          .from("people")
          .update({
            roles,
            member_tier: "business",
            member_status: "active",
            stripe_customer_id: stripeCustomerId,
            ...(resolved.via === "minted" ? { joined_at: nowIso } : {}),
            updated_at: nowIso,
          })
          .eq("id", personId);

        if (personStampErr) {
          console.error("[APPROVE] people stamp failed (non-blocking):", personStampErr.message);
        } else {
          console.log("[APPROVE] people row stamped business/active:", personId);
        }
      } else {
        console.error("[APPROVE] LOUD: could not resolve or mint a people row for", profile.id);
      }
    } catch (personErr) {
      console.error("[APPROVE] people provisioning failed (non-blocking):", String(personErr));
    }

    // ── Step 13: Ensure business_card row exists ─────────────────────────────
    const { data: existingCard } = await supabase
      .from("business_cards")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!existingCard) {
      console.log("[APPROVE] Creating business_card for user:", profile.id);
      const { error: cardErr } = await supabase.from("business_cards").insert({
        user_id: profile.id,
        public_id: randomPublicId12(),
        full_name: profile.full_name ?? `${app.first_name} ${app.last_name}`,
        email: profile.email ?? app.email,
        phone: profile.phone ?? app.phone,
        avatar_url: profile.avatar_url ?? null,
        title: null,
        company: null,
        linkedin_url: null,
        website_url: null,
      });
      if (cardErr) {
        console.error("[APPROVE] business_card insert error (non-blocking):", cardErr.message);
      } else {
        console.log("[APPROVE] business_card created");
      }
    } else {
      console.log("[APPROVE] business_card already exists for user:", profile.id);
    }

    // ── Step 14: Welcome posts on social + business feeds ────────────────────
    const firstName = (app.first_name || "").trim() || "there";
    const welcomeContent = `Welcome ${firstName}! Just joined 704 Business - say hi below.`;
    const imageUrls = profile.avatar_url ? [profile.avatar_url] : [];

    const { error: postsErr } = await supabase.from("posts").insert([
      { author_id: profile.id, feed_type: "social",   content: welcomeContent, image_urls: imageUrls, created_at: nowIso },
      { author_id: profile.id, feed_type: "business", content: welcomeContent, image_urls: imageUrls, created_at: nowIso },
    ]);
    if (postsErr) {
      console.error("[APPROVE] Welcome feed posts failed (non-blocking):", postsErr.message);
    } else {
      console.log("[APPROVE] Welcome posts created on social + business feeds");
    }

    // ── Step 15: Update application row (LAST — all fields atomically) ───────
    console.log("[APPROVE] Marking application as approved:", application_id);
    const { error: appUpdateErr } = await supabase
      .from("business_applications")
      .update({
        status: "approved",
        approved_at: nowIso,
        reviewed_at: nowIso,
        decision_email_sent_at: nowIso,
        stripe_subscription_id: newSubscriptionId,
        stripe_payment_method_id: paymentMethodId,
        card_saved: true,
      })
      .eq("id", application_id);
    if (appUpdateErr) {
      // Log but don't throw — Stripe + profile are already updated; this is cosmetic
      console.error("[APPROVE] Application status update error (non-blocking):", appUpdateErr.message);
    }

    // ── Step 15b: Ambassador referral ledger ─────────────────────────────────
    // Written in exactly the shape the shipped conversion watcher already looks
    // for: status 'signed_up' plus the subscription id. When the second invoice
    // succeeds, stripe-webhook flips it to 'converted' / payout_status 'owed'
    // and the Monday payout run picks it up. No new machinery.
    if (app.ambassador_id && app.referral_code) {
      const { data: existingAmbRef } = await supabase
        .from("ambassador_referrals")
        .select("id")
        .eq("stripe_subscription_id", newSubscriptionId)
        .maybeSingle();

      if (existingAmbRef) {
        console.log("[APPROVE] ambassador_referrals row already exists, skipping:", existingAmbRef.id);
      } else {
        const { data: ambRef, error: ambRefErr } = await supabase
          .from("ambassador_referrals")
          .insert({
            ambassador_id: app.ambassador_id,
            referred_profile_id: profile.id,
            referred_email: app.email,
            referred_full_name: `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim() || null,
            referred_person_id: personId,
            tier: "business",
            reward_cents: AMBASSADOR_BUSINESS_REWARD_CENTS,
            status: "signed_up",
            referral_code: app.referral_code,
            stripe_subscription_id: newSubscriptionId,
            referred_at: nowIso,
            payout_status: "pending",
          })
          .select("id")
          .maybeSingle();

        if (ambRefErr) {
          console.error("[APPROVE] ambassador_referrals insert failed (non-blocking):", ambRefErr.message);
        } else {
          console.log("[APPROVE] ambassador_referrals row created:", ambRef?.id, "sub:", newSubscriptionId);
        }
      }
    }

    // ── Step 15c: Member referral ledger ─────────────────────────────────────
    // Only the reviewer's confirmed choice pays. An unconfirmed auto-match is a
    // suggestion, so it credits nobody. A referral is a bonus, never a gate:
    // a failure here must not affect a membership that is already paid for.
    if (app.confirmed_referrer_profile_id) {
      if (app.confirmed_referrer_profile_id === profile.id) {
        console.error("[APPROVE] LOUD: confirmed referrer is the applicant, refusing to write ledger row");
      } else {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", app.confirmed_referrer_profile_id)
          .maybeSingle();

        const { data: ledgerRow, error: ledgerErr } = await supabase
          .from("referrals")
          .insert({
            referred_profile_id: profile.id,
            referred_application_id: app.id,
            referrer_profile_id: app.confirmed_referrer_profile_id,
            amount_cents: MEMBER_REFERRAL_AMOUNT_CENTS,
            status: "pending",
            stripe_subscription_id: newSubscriptionId,
            // Display snapshot for /admin/referrals, frozen at approval time.
            referrer_name: referrer?.full_name ?? null,
            referrer_email: referrer?.email ?? null,
            referred_name: `${app.first_name ?? ""} ${app.last_name ?? ""}`.trim() || null,
            referred_email: app.email,
            payout_status: "pending",
          })
          .select("id")
          .maybeSingle();

        if (ledgerErr) {
          // 23505 means the unique index on referred_application_id caught a
          // retry. That is the guard working, not a failure.
          if ((ledgerErr as { code?: string }).code === "23505") {
            console.log("[APPROVE] referrals ledger row already exists for this application, skipping");
          } else {
            console.error("[APPROVE] referrals ledger insert failed (non-blocking):", ledgerErr.message);
          }
        } else {
          console.log(
            "[APPROVE] referrals ledger row created:", ledgerRow?.id,
            "referrer:", app.confirmed_referrer_profile_id,
            "sub:", newSubscriptionId
          );
        }
      }
    }

    // ── Step 16: Send approval email ─────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const creditNoteHtml =
      proratedCredit > 0
        ? `<p>Your social membership credit of $${(proratedCredit / 100).toFixed(2)} has been applied to your first month.</p>`
        : undefined;

    console.log("[APPROVE] Sending approval email to:", app.email);
    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        to: app.email,
        template: "business-membership-approved",
        data: {
          firstName: (app.first_name || "there").trim(),
          creditNoteHtml,
          origin: SITE_URL,
        },
      }),
    });
    if (!emailRes.ok) {
      console.error("[APPROVE] send-email returned", emailRes.status, "(non-blocking)");
    } else {
      console.log("[APPROVE] Approval email sent");
    }

    console.log("[APPROVE] Approval complete for application:", application_id, "subscription:", newSubscriptionId);

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: newSubscriptionId,
        prorated_credit_cents: proratedCredit,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[APPROVE] approve-business-application error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
