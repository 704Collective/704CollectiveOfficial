import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (msg: string, details?: unknown) => {
  console.log(`[RECONCILE] ${msg}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: require admin ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

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

    log("Admin authenticated", { callerId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ===== FIX 5: Reconcile existing profiles =====

    // 1. Get all profiles with stripe_customer_id
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id, email, stripe_customer_id, subscription_status, subscription_ends_at, cancel_at_period_end, membership_override, deleted_at")
      .not("stripe_customer_id", "is", null);

    if (pErr) throw new Error(`Profiles fetch error: ${pErr.message}`);
    log("Profiles with stripe_customer_id", { count: profiles?.length });

    const corrections: Array<{
      profileId: string;
      email: string;
      before: string | null;
      after: string;
      reason: string;
    }> = [];

    // Process each profile
    for (const profile of profiles ?? []) {
      // Skip soft-deleted
      if (profile.deleted_at) continue;
      // Skip manual members with override and no stripe customer
      if (profile.membership_override && !profile.stripe_customer_id) continue;

      const custId = profile.stripe_customer_id;
      if (!custId) continue;

      try {
        // Get active subscriptions for this customer
        const activeSubs = await stripe.subscriptions.list({
          customer: custId,
          status: "active",
          limit: 1,
        });

        const hasActive = activeSubs.data.length > 0;

        if (hasActive) {
          const sub = activeSubs.data[0];
          const itemPeriodEnd = sub.items?.data?.[0]?.current_period_end;
          const endDate = typeof itemPeriodEnd === "number"
            ? new Date(itemPeriodEnd * 1000).toISOString()
            : typeof itemPeriodEnd === "string"
              ? new Date(itemPeriodEnd).toISOString()
              : null;
          const cancelAtEnd = sub.cancel_at_period_end === true;

          const updates: Record<string, unknown> = {
            subscription_ends_at: endDate,
            cancel_at_period_end: cancelAtEnd,
          };

          // DB says canceled but Stripe says active
          if (profile.subscription_status !== "active") {
            updates.subscription_status = "active";
            corrections.push({
              profileId: profile.id,
              email: profile.email,
              before: profile.subscription_status,
              after: "active",
              reason: "Stripe has active subscription but DB was not active",
            });
          } else if (cancelAtEnd && !profile.cancel_at_period_end) {
            // Active but cancel_at_period_end mismatch
            corrections.push({
              profileId: profile.id,
              email: profile.email,
              before: "active (no cancel flag)",
              after: "active (cancel_at_period_end=true)",
              reason: "Stripe shows cancel_at_period_end but DB flag was false",
            });
          } else if (!cancelAtEnd && profile.cancel_at_period_end) {
            corrections.push({
              profileId: profile.id,
              email: profile.email,
              before: "active (cancel_at_period_end=true)",
              after: "active (cancel_at_period_end=false)",
              reason: "Stripe shows subscription NOT canceling but DB flag was true (reactivated?)",
            });
          } else if (!profile.subscription_ends_at && endDate) {
            corrections.push({
              profileId: profile.id,
              email: profile.email,
              before: `active (no end date)`,
              after: `active (ends ${endDate})`,
              reason: "subscription_ends_at was null, now populated",
            });
          }

          await admin.from("profiles").update(updates).eq("id", profile.id);
        } else {
          // No active subscription — check if DB says active
          if (profile.subscription_status === "active" && !profile.membership_override) {
            await admin.from("profiles").update({
              subscription_status: "canceled",
              cancel_at_period_end: false,
            }).eq("id", profile.id);
            corrections.push({
              profileId: profile.id,
              email: profile.email,
              before: "active",
              after: "canceled",
              reason: "No active Stripe subscription found",
            });
          }
        }
      } catch (e) {
        log(`Error processing customer ${custId}`, { error: e instanceof Error ? e.message : String(e) });
      }
    }

    log("Fix 5 corrections", { count: corrections.length });

    // ===== FIX 6: Import missing Stripe customers =====

    // Collect all existing stripe_customer_ids
    const existingCustIds = new Set(
      (profiles ?? []).map((p) => p.stripe_customer_id).filter(Boolean)
    );

    // Also get profiles without stripe_customer_id to check by email
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("email");
    const existingEmails = new Set(
      (allProfiles ?? []).map((p) => p.email?.toLowerCase())
    );

    // List ALL Stripe customers (paginate)
    const imports: Array<{
      email: string;
      name: string | null;
      customerId: string;
      status: string;
      authCreated: boolean;
    }> = [];

    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.CustomerListParams = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;

      const customers = await stripe.customers.list(params);

      for (const cust of customers.data) {
        if (!cust.email) continue;
        if (existingCustIds.has(cust.id)) continue;
        if (existingEmails.has(cust.email.toLowerCase())) {
          // They exist by email but missing stripe_customer_id — link them
          await admin
            .from("profiles")
            .update({ stripe_customer_id: cust.id })
            .eq("email", cust.email);
          continue;
        }

        // Check if this customer has any subscription history
        const subs = await stripe.subscriptions.list({
          customer: cust.id,
          limit: 1,
        });
        // Also check active
        const activeSubs = await stripe.subscriptions.list({
          customer: cust.id,
          status: "active",
          limit: 1,
        });

        if (subs.data.length === 0) continue; // No subscription history, skip

        const isActive = activeSubs.data.length > 0;
        const status = isActive ? "active" : "canceled";

        let endDate: string | null = null;
        let cancelAtEnd = false;
        if (isActive) {
          const sub = activeSubs.data[0];
          const itemPeriodEnd = sub.items?.data?.[0]?.current_period_end;
          endDate = typeof itemPeriodEnd === "number"
            ? new Date(itemPeriodEnd * 1000).toISOString()
            : null;
          cancelAtEnd = sub.cancel_at_period_end === true;
        }

        // Create auth account only for active members
        let authCreated = false;
        let userId: string | undefined;
        if (isActive) {
          try {
            const { data: authData, error: authErr } = await admin.auth.admin.createUser({
              email: cust.email,
              email_confirm: true,
              user_metadata: { full_name: cust.name ?? "" },
            });
            if (authErr) {
              // If user already exists in auth, get their ID
              if (authErr.message?.includes("already been registered")) {
                const { data: existingUser } = await admin.auth.admin.getUserByEmail(cust.email);
                if (existingUser?.user) userId = existingUser.user.id;
              } else {
                log(`Auth create error for ${cust.email}`, { error: authErr.message });
                continue;
              }
            } else if (authData?.user) {
              userId = authData.user.id;
              authCreated = true;
            }
          } catch (e) {
            log(`Auth error for ${cust.email}`, { error: e instanceof Error ? e.message : String(e) });
            continue;
          }
        }

        if (!userId && !isActive) {
          // For canceled members, create profile without auth using a deterministic UUID
          // We can't insert into profiles without a valid UUID for id
          // Skip canceled members without auth accounts — they can sign up fresh later
          continue;
        }

        if (userId) {
          // Upsert profile
          const { error: profErr } = await admin.from("profiles").upsert({
            id: userId,
            email: cust.email,
            full_name: cust.name ?? null,
            stripe_customer_id: cust.id,
            subscription_status: status,
            subscription_ends_at: endDate,
            cancel_at_period_end: cancelAtEnd,
            member_since: isActive ? new Date().toISOString() : null,
          }, { onConflict: "id" });

          if (profErr) {
            log(`Profile upsert error for ${cust.email}`, { error: profErr.message });
            continue;
          }

          imports.push({
            email: cust.email,
            name: cust.name,
            customerId: cust.id,
            status,
            authCreated,
          });
          existingCustIds.add(cust.id);
          existingEmails.add(cust.email.toLowerCase());
        }
      }

      hasMore = customers.has_more;
      if (customers.data.length > 0) {
        startingAfter = customers.data[customers.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    log("Fix 6 imports", { count: imports.length });

    // ===== Final counts =====
    const { data: finalCounts } = await admin.rpc("execute_raw_count_query" as never);
    // Can't run raw SQL, so let's get all profiles and count manually
    const { data: allFinal } = await admin
      .from("profiles")
      .select("subscription_status")
      .is("deleted_at", null);

    const statusCounts: Record<string, number> = {};
    for (const p of allFinal ?? []) {
      const s = p.subscription_status ?? "null";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    // Check subscription_ends_at populated for active members
    const { data: activeMembers } = await admin
      .from("profiles")
      .select("id, email, subscription_ends_at, cancel_at_period_end")
      .eq("subscription_status", "active")
      .is("deleted_at", null);

    const activeWithEndDate = (activeMembers ?? []).filter(m => m.subscription_ends_at).length;
    const activeWithoutEndDate = (activeMembers ?? []).filter(m => !m.subscription_ends_at).length;

    return new Response(
      JSON.stringify({
        fix5_reconciliation: {
          profiles_checked: (profiles ?? []).filter(p => !p.deleted_at).length,
          corrections_made: corrections.length,
          corrections,
        },
        fix6_imports: {
          total_imported: imports.length,
          imports,
          status_breakdown: imports.reduce((acc, i) => {
            acc[i.status] = (acc[i.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
        final_status_counts: statusCounts,
        active_members_end_date: {
          with_end_date: activeWithEndDate,
          without_end_date: activeWithoutEndDate,
          total_active: (activeMembers ?? []).length,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
