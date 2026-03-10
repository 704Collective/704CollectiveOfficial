import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOCIAL_PRODUCT_ID = "prod_TZI8im1xRNUMuy";

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

    const removed: Array<{ email: string; name: string | null; customerId: string; productId: string; productName: string }> = [];
    const kept: Array<{ email: string; name: string | null; productId: string }> = [];

    for (const profile of recentProfiles ?? []) {
      const custId = profile.stripe_customer_id;
      if (!custId) continue;

      try {
        const subs = await stripe.subscriptions.list({
          customer: custId,
          status: "active",
          limit: 1,
        });

        if (subs.data.length === 0) {
          // No active sub — check any sub
          const allSubs = await stripe.subscriptions.list({ customer: custId, limit: 1 });
          if (allSubs.data.length > 0) {
            const productId = allSubs.data[0].items.data[0]?.price?.product as string;
            if (productId !== SOCIAL_PRODUCT_ID) {
              // Business member — soft delete
              await softDelete(admin, profile.id, profile.email);
              const product = await stripe.products.retrieve(productId);
              removed.push({ email: profile.email, name: profile.full_name, customerId: custId, productId, productName: product.name });
            } else {
              kept.push({ email: profile.email, name: profile.full_name, productId });
            }
          }
          continue;
        }

        const sub = subs.data[0];
        const productId = sub.items.data[0]?.price?.product as string;

        if (productId !== SOCIAL_PRODUCT_ID) {
          // Business member — soft delete
          await softDelete(admin, profile.id, profile.email);
          const product = await stripe.products.retrieve(productId);
          removed.push({ email: profile.email, name: profile.full_name, customerId: custId, productId, productName: product.name });
        } else {
          kept.push({ email: profile.email, name: profile.full_name, productId });
        }
      } catch (e) {
        console.error(`Error checking ${profile.email}:`, e instanceof Error ? e.message : String(e));
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
  }).eq("id", userId);

  // Ban auth account
  try {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
  } catch (e) {
    console.error(`Ban error for ${email}:`, e instanceof Error ? e.message : String(e));
  }
}
