import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
// Wave H2: product identity comes from the one shared definition (env-driven,
// same prod id as fallback). Listing subscriptions are neither social nor
// business and are skipped by this sweep.
import { SOCIAL_PRODUCT_ID, isListingSubscription } from "../_shared/stripeProducts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: roleRow } = await admin
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get recently imported profiles (created in last 24h with stripe_customer_id, active)
    // These are the ones created by reconcile-stripe
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentProfiles, error: pErr } = await admin
      .from("profiles")
      .select("id, email, full_name, stripe_customer_id, member_since, created_at")
      .not("stripe_customer_id", "is", null)
      .is("deleted_at", null)
      .gte("created_at", twentyFourHoursAgo);

    if (pErr) throw new Error(`Profiles fetch: ${pErr.message}`);

    console.log(`Found ${recentProfiles?.length ?? 0} recently created profiles`);

    const removed: Array<{ email: string; name: string | null; customerId: string; productId: string; productName: string; stripe_canceled: string[] }> = [];
    const kept: Array<{ email: string; name: string | null; productId: string }> = [];
    // Wave 10: a row whose Stripe cancel fails is SKIPPED (profile untouched)
    // and reported here - never hidden while still billing, never silent.
    const errors: Array<{ email: string; customerId: string; error: string }> = [];
    // Wave H2: rows whose only subscriptions are listings are reported here, untouched.
    const skipped: Array<{ email: string; customerId: string; reason: string }> = [];

    // Cancel every live MEMBERSHIP subscription for the customer before hiding
    // the profile. Listing subscriptions are left alone (hiding a business
    // member must not kill their hub listing). Throws on the first failure so
    // the caller can skip-and-report the row.
    const cancelLive = async (custId: string): Promise<string[]> => {
      const all = await stripe.subscriptions.list({ customer: custId, status: "all", limit: 100 });
      const canceled: string[] = [];
      for (const s of all.data) {
        if (s.status === "canceled" || s.status === "incomplete_expired") continue;
        if (isListingSubscription(s)) continue;
        await stripe.subscriptions.cancel(s.id);
        canceled.push(s.id);
      }
      return canceled;
    };

    for (const profile of recentProfiles ?? []) {
      const custId = profile.stripe_customer_id;
      if (!custId) continue;

      try {
        const subsRaw = await stripe.subscriptions.list({
          customer: custId,
          status: "active",
          limit: 10,
        });
        // Wave H2 wall: classify by the first non-listing subscription. Unset env => identical to limit:1.
        const subs = { data: subsRaw.data.filter((s: Stripe.Subscription) => !isListingSubscription(s)) };
        if (subs.data.length === 0 && subsRaw.data.length > 0) {
          skipped.push({ email: profile.email, customerId: custId, reason: "only listing subscriptions on customer" });
          continue;
        }

        if (subs.data.length === 0) {
          // No active sub — check any sub
          const allSubsRaw = await stripe.subscriptions.list({ customer: custId, limit: 10 });
          const allSubs = { data: allSubsRaw.data.filter((s: Stripe.Subscription) => !isListingSubscription(s)) };
          if (allSubs.data.length === 0 && allSubsRaw.data.length > 0) {
            skipped.push({ email: profile.email, customerId: custId, reason: "only listing subscriptions on customer" });
            continue;
          }
          if (allSubs.data.length > 0) {
            const productId = allSubs.data[0].items.data[0]?.price?.product as string;
            if (productId !== SOCIAL_PRODUCT_ID) {
              // Business member — Stripe first, then soft delete
              let canceledIds: string[];
              try {
                canceledIds = await cancelLive(custId);
              } catch (cancelErr) {
                const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
                console.error(`Stripe cancel FAILED for ${profile.email} - row skipped, profile untouched: ${msg}`);
                errors.push({ email: profile.email, customerId: custId, error: msg });
                continue;
              }
              await softDelete(admin, profile.id, profile.email);
              const product = await stripe.products.retrieve(productId);
              removed.push({ email: profile.email, name: profile.full_name, customerId: custId, productId, productName: product.name, stripe_canceled: canceledIds });
            } else {
              kept.push({ email: profile.email, name: profile.full_name, productId });
            }
          }
          continue;
        }

        const sub = subs.data[0];
        const productId = sub.items.data[0]?.price?.product as string;

        if (productId !== SOCIAL_PRODUCT_ID) {
          // Business member — Stripe first, then soft delete
          let canceledIds: string[];
          try {
            canceledIds = await cancelLive(custId);
          } catch (cancelErr) {
            const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
            console.error(`Stripe cancel FAILED for ${profile.email} - row skipped, profile untouched: ${msg}`);
            errors.push({ email: profile.email, customerId: custId, error: msg });
            continue;
          }
          await softDelete(admin, profile.id, profile.email);
          const product = await stripe.products.retrieve(productId);
          removed.push({ email: profile.email, name: profile.full_name, customerId: custId, productId, productName: product.name, stripe_canceled: canceledIds });
        } else {
          kept.push({ email: profile.email, name: profile.full_name, productId });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Error checking ${profile.email}:`, msg);
        errors.push({ email: profile.email, customerId: custId, error: msg });
      }
    }

    // Final status counts
    const { data: allFinal } = await admin
      .from("profiles")
      .select("subscription_status")
      .is("deleted_at", null);

    const statusCounts: Record<string, number> = {};
    for (const p of allFinal ?? []) {
      const s = p.subscription_status ?? "null";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return new Response(
      JSON.stringify({
        removed: { count: removed.length, members: removed },
        kept: { count: kept.length, members: kept },
        errors: { count: errors.length, rows: errors },
        skipped: { count: skipped.length, rows: skipped },
        final_status_counts: statusCounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function softDelete(admin: ReturnType<typeof createClient>, userId: string, email: string) {
  console.log(`Soft-deleting business member: ${email} (${userId})`);

  // Set deleted_at + clear subscription
  await admin.from("profiles").update({
    deleted_at: new Date().toISOString(),
    subscription_status: "inactive",
    membership_override: false,
    cancel_at_period_end: false,
    subscription_id: null, // Wave 10: Stripe was canceled just above; no live pointer remains
  }).eq("id", userId);

  // Ban auth account
  try {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
  } catch (e) {
    console.error(`Ban error for ${email}:`, e instanceof Error ? e.message : String(e));
  }
}
