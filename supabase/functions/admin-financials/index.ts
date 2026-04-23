import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_KEY = "financial_dashboard_v2";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const log = (step: string, details?: unknown) =>
  console.log(`[ADMIN-FINANCIALS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

// Product → tier mapping
const PRODUCT_TIERS: Record<string, { tier: "social" | "business"; label: string; monthlyRate: number }> = {
  prod_TZI8im1xRNUMuy: { tier: "social", label: "Social", monthlyRate: 3000 },
  prod_Tp1hxIreJ2Uepz: { tier: "business", label: "Business (Founding)", monthlyRate: 15000 },
  prod_U4X7hj2PX84LW5: { tier: "business", label: "Business", monthlyRate: 30000 },
};

function classifySub(sub: Stripe.Subscription): { tier: "social" | "business" | "unknown"; label: string; monthlyAmountCents: number; productId: string } {
  const item = sub.items?.data?.[0];
  if (!item) return { tier: "unknown", label: "Unknown", monthlyAmountCents: 0, productId: "" };
  const productId = typeof item.price.product === "string" ? item.price.product : (item.price.product as any)?.id || "";
  const info = PRODUCT_TIERS[productId];
  const amount = item.price.unit_amount || 0;
  const interval = item.price.recurring?.interval;
  const monthly = interval === "year" ? Math.round(amount / 12) : amount;
  return {
    tier: info?.tier || "unknown",
    label: info?.label || "Unknown",
    monthlyAmountCents: monthly,
    productId,
  };
}

function getSubCustomerInfo(sub: Stripe.Subscription) {
  const cust = sub.customer;
  if (typeof cust === "string") return { email: null, name: null };
  const c = cust as any;
  return { email: c?.email || null, name: c?.name || null };
}

function getSubNextBilling(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const periodEnd = (item as any)?.current_period_end;
  if (periodEnd) return new Date(periodEnd * 1000).toISOString();
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // Auth: verify admin via direct fetch to avoid JWT audience mismatch that
    // occurs when supabase.auth.getUser is called with a token issued for a
    // different host (e.g. Vercel preview URL vs. production URL).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
    );
    const { data: { user: userJson }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userJson?.id) throw new Error("Not authenticated");

    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userJson.id)
      .maybeSingle();
    if (!profileData || (profileData.role !== "admin" && profileData.role !== "super_admin")) {
      throw new Error("Not an admin");
    }
    log("Admin verified", { userId: userJson.id });

    // Parse body for force_refresh
    let forceRefresh = false;
    try {
      const body = await req.json();
      forceRefresh = body?.force_refresh === true;
    } catch { /* no body = not force */ }

    // Check cache
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("financial_cache")
        .select("data, fetched_at")
        .eq("cache_key", CACHE_KEY)
        .maybeSingle();

      if (cached) {
        const age = Date.now() - new Date(cached.fetched_at).getTime();
        if (age < CACHE_TTL_MS) {
          log("Returning cached data", { ageMinutes: Math.round(age / 60000) });
          return new Response(JSON.stringify({ ...cached.data, cached: true, last_updated: cached.fetched_at }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    log("Fetching fresh data from Stripe");
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

    const now = new Date();
    const nowTs = Math.floor(now.getTime() / 1000);
    const daysAgo = (d: number) => nowTs - d * 86400;

    // Parallel Stripe calls
    const [activeSubs, canceledSubs, pastDueSubs, invoices90, dbProfiles] = await Promise.all([
      fetchAllSubs(stripe, "active"),
      fetchAllSubs(stripe, "canceled", 200),
      fetchAllSubs(stripe, "past_due"),
      fetchAllInvoices(stripe, daysAgo(90)),
      supabase.from("profiles").select("subscription_status, member_since, cancel_at_period_end, deleted_at, stripe_customer_id, subscription_ends_at").is("deleted_at", null),
    ]);

    const revenue30 = { social: 0, business: 0 };
    const revenue60 = { social: 0, business: 0 };
    const revenue90rev = { social: 0, business: 0 };

    // Build subscription ID → tier map from already-fetched subs
    const subTierMap: Record<string, "social" | "business"> = {};
    for (const sub of [...activeSubs, ...canceledSubs]) {
      const { tier } = classifySub(sub);
      if (tier !== "unknown") {
        subTierMap[sub.id] = tier;
      }
    }

    // Helper to extract subscription ID from invoice (basil API uses parent.subscription_details)
    const getInvSubId = (inv: any): string | null => {
      return inv.subscription || inv.parent?.subscription_details?.subscription || inv.lines?.data?.[0]?.subscription || null;
    };

    // Classify subscription revenue from invoices using sub ID lookup
    for (const inv of invoices90) {
      const amountPaid = (inv.amount_paid || 0) / 100;
      if (amountPaid <= 0) continue;
      const created = inv.created;
      const subIdStr = getInvSubId(inv);
      const bucket: "social" | "business" = subIdStr && subTierMap[subIdStr] ? subTierMap[subIdStr] : "social";

      if (created >= daysAgo(30)) revenue30[bucket] += amountPaid;
      if (created >= daysAgo(60)) revenue60[bucket] += amountPaid;
      revenue90rev[bucket] += amountPaid;
    }

    // Monthly revenue trend (last 6 months, by tier)
    const monthlyRevenue: Record<string, { social: number; business: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyRevenue[key] = { social: 0, business: 0 };
    }

    for (const inv of invoices90) {
      const amountPaid = (inv.amount_paid || 0) / 100;
      if (amountPaid <= 0) continue;
      const d = new Date(inv.created * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthlyRevenue) {
        const subIdStr = getInvSubId(inv);
        const bucket: "social" | "business" = subIdStr && subTierMap[subIdStr] ? subTierMap[subIdStr] : "social";
        monthlyRevenue[key][bucket] += amountPaid;
      }
    }

    const revenueTrend = Object.entries(monthlyRevenue).map(([month, vals]) => ({
      month,
      social: Math.round(vals.social),
      business: Math.round(vals.business),
      total: Math.round(vals.social + vals.business),
    }));

    // ===== MRR =====
    let mrrSocial = 0;
    let mrrBusiness = 0;
    const tierBreakdown: Record<string, { count: number; mrr: number }> = {};
    const activeByTier = { social: 0, business: 0 };

    for (const sub of activeSubs) {
      const { tier, label, monthlyAmountCents } = classifySub(sub);
      if (tier === "social") {
        mrrSocial += monthlyAmountCents;
        activeByTier.social++;
      } else if (tier === "business") {
        mrrBusiness += monthlyAmountCents;
        activeByTier.business++;
      }
      if (!tierBreakdown[label]) tierBreakdown[label] = { count: 0, mrr: 0 };
      tierBreakdown[label].count++;
      tierBreakdown[label].mrr += monthlyAmountCents / 100;
    }

    const totalMRR = (mrrSocial + mrrBusiness) / 100;
    const totalActiveSubs = activeSubs.length;
    const arpm = totalActiveSubs > 0 ? Math.round((totalMRR / totalActiveSubs) * 100) / 100 : 0;

    // ===== MEMBERS =====
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // New subscribers this month / last month (from Stripe sub start)
    let newThisMonth = 0;
    let newLastMonth = 0;
    for (const sub of activeSubs) {
      const startDate = new Date((sub as any).start_date * 1000 || sub.created * 1000);
      if (startDate >= startOfThisMonth) newThisMonth++;
      else if (startDate >= startOfLastMonth && startDate < startOfThisMonth) newLastMonth++;
    }

    // Cancellations this month / last month
    let canceledThisMonth = 0;
    let canceledLastMonth = 0;
    const canceledByTier = { social: 0, business: 0 };
    for (const sub of canceledSubs) {
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
      if (!canceledAt) continue;
      const { tier } = classifySub(sub);
      if (canceledAt >= startOfThisMonth) {
        canceledThisMonth++;
        if (tier === "social") canceledByTier.social++;
        else if (tier === "business") canceledByTier.business++;
      } else if (canceledAt >= startOfLastMonth && canceledAt < startOfThisMonth) {
        canceledLastMonth++;
      }
    }

    // Pending cancellations
    const pendingCancellations = activeSubs.filter((s) => s.cancel_at_period_end).length;
    // Also from DB
    const dbPending = dbProfiles.data?.filter((p) => p.cancel_at_period_end)?.length || 0;

    // ===== CHURN =====
    // Monthly churn rate = cancellations this month / (active at start of month)
    // Active at start = current active + canceled this month - new this month
    const activeAtStartOfMonth = totalActiveSubs + canceledThisMonth - newThisMonth;
    const churnRateThisMonth = activeAtStartOfMonth > 0
      ? Math.round((canceledThisMonth / activeAtStartOfMonth) * 10000) / 100
      : 0;
    const activeAtStartLastMonth = totalActiveSubs + canceledThisMonth + canceledLastMonth - newThisMonth - newLastMonth;
    const churnRateLastMonth = activeAtStartLastMonth > 0
      ? Math.round((canceledLastMonth / activeAtStartLastMonth) * 10000) / 100
      : 0;

    // Average member lifetime (canceled members with member_since)
    const canceledWithDates = canceledSubs.filter((s) => {
      const startTs = (s as any).start_date || s.created;
      return startTs && s.canceled_at;
    });
    let avgLifetimeMonths = 0;
    if (canceledWithDates.length > 0) {
      const totalMonths = canceledWithDates.reduce((sum, s) => {
        const start = ((s as any).start_date || s.created) * 1000;
        const end = (s.canceled_at || 0) * 1000;
        return sum + (end - start) / (30.44 * 86400000);
      }, 0);
      avgLifetimeMonths = Math.round((totalMonths / canceledWithDates.length) * 10) / 10;
    }

    // Revenue churn (MRR lost from cancellations this month)
    let revenueChurn = 0;
    for (const sub of canceledSubs) {
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
      if (!canceledAt || canceledAt < startOfThisMonth) continue;
      const { monthlyAmountCents } = classifySub(sub);
      revenueChurn += monthlyAmountCents / 100;
    }

    // Churn trend (last 6 months)
    const churnTrend: { month: string; cancellations: number; rate: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const key = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, "0")}`;
      const canceled = canceledSubs.filter((s) => {
        const ca = s.canceled_at ? new Date(s.canceled_at * 1000) : null;
        return ca && ca >= mStart && ca < mEnd;
      }).length;
      // Rough estimate of active at start of that month
      const estimatedActive = totalActiveSubs + canceledSubs.filter((s) => {
        const ca = s.canceled_at ? new Date(s.canceled_at * 1000) : null;
        return ca && ca >= mStart;
      }).length;
      const rate = estimatedActive > 0 ? Math.round((canceled / estimatedActive) * 10000) / 100 : 0;
      churnTrend.push({ month: key, cancellations: canceled, rate });
    }

    // Net growth
    const netGrowthThisMonth = newThisMonth - canceledThisMonth;

    // ===== PROJECTIONS =====
    const avgChurnRate3m = churnTrend.slice(-3).reduce((s, c) => s + c.rate, 0) / 3;
    const monthlyChurnFraction = avgChurnRate3m / 100;

    const projections = {
      optimistic: {
        days30: totalMRR,
        days60: totalMRR * 2,
        days90: totalMRR * 3,
        byTier: {
          social: (mrrSocial / 100),
          business: (mrrBusiness / 100),
        },
      },
      adjusted: {
        days30: Math.round(totalMRR * (1 - monthlyChurnFraction)),
        days60: Math.round(totalMRR * (2 - 3 * monthlyChurnFraction)),
        days90: Math.round(totalMRR * (3 - 6 * monthlyChurnFraction)),
        byTier: {
          social: Math.round((mrrSocial / 100) * (1 - monthlyChurnFraction)),
          business: Math.round((mrrBusiness / 100) * (1 - monthlyChurnFraction)),
        },
      },
    };

    // ===== DB MEMBER COUNTS =====
    const memberCounts: Record<string, number> = {};
    if (dbProfiles.data) {
      for (const p of dbProfiles.data) {
        const status = p.subscription_status || "inactive";
        memberCounts[status] = (memberCounts[status] || 0) + 1;
      }
    }

    // Recent payments (last 20 invoices, sorted by date)
    const allRecentItems = invoices90
      .filter((inv) => (inv.amount_paid || 0) > 0)
      .map((inv) => ({
        id: inv.id,
        amount: (inv.amount_paid || 0) / 100,
        currency: inv.currency || "usd",
        status: inv.status || "paid",
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        customer_email: inv.customer_email || null,
        customer_name: (inv as any).customer_name || null,
        description: inv.lines?.data?.[0]?.description || "Subscription payment",
        created: inv.created,
      }))
      .sort((a, b) => (b.created || 0) - (a.created || 0))
      .slice(0, 20)
      .map(({ created, ...rest }) => rest);

    // ===== MEMBER DETAIL ARRAYS =====
    const activeMembers = activeSubs.map((sub) => {
      const { label } = classifySub(sub);
      const { email, name } = getSubCustomerInfo(sub);
      const memberSince = new Date(((sub as any).start_date || sub.created) * 1000).toISOString();
      const nextBilling = getSubNextBilling(sub);
      return { name, email, tier: label, memberSince, nextBilling };
    });

    const newMembers = activeSubs
      .filter((sub) => {
        const startDate = new Date(((sub as any).start_date || sub.created) * 1000);
        return startDate >= startOfThisMonth;
      })
      .map((sub) => {
        const { label } = classifySub(sub);
        const { email, name } = getSubCustomerInfo(sub);
        const signupDate = new Date(((sub as any).start_date || sub.created) * 1000).toISOString();
        return { name, email, tier: label, signupDate };
      });

    const canceledMembers = canceledSubs
      .filter((sub) => {
        const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
        return canceledAt && canceledAt >= startOfThisMonth;
      })
      .map((sub) => {
        const { label } = classifySub(sub);
        const { email, name } = getSubCustomerInfo(sub);
        const cancelDate = sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null;
        const startTs = ((sub as any).start_date || sub.created) * 1000;
        const endTs = (sub.canceled_at || 0) * 1000;
        const lifetimeMonths = Math.round((endTs - startTs) / (30.44 * 86400000) * 10) / 10;
        return { name, email, tier: label, cancelDate, lifetimeMonths };
      });

    const pastDueMembers = pastDueSubs.map((sub) => {
      const { email, name } = getSubCustomerInfo(sub);
      const amount = (sub.items?.data?.[0]?.price?.unit_amount || 0) / 100;
      const item = sub.items?.data?.[0];
      const periodEnd = (item as any)?.current_period_end;
      const daysOverdue = periodEnd ? Math.floor((Date.now() / 1000 - periodEnd) / 86400) : 0;
      return { name, email, amount, daysOverdue };
    });

    const pendingCancelMembers = activeSubs
      .filter((s) => s.cancel_at_period_end)
      .map((sub) => {
        const { email, name } = getSubCustomerInfo(sub);
        const { label } = classifySub(sub);
        const accessEnds = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : getSubNextBilling(sub);
        return { name, email, tier: label, accessEnds };
      });

    const payload = {
      revenue: {
        last30: { social: Math.round(revenue30.social), business: Math.round(revenue30.business), total: Math.round(revenue30.social + revenue30.business) },
        last60: { social: Math.round(revenue60.social), business: Math.round(revenue60.business), total: Math.round(revenue60.social + revenue60.business) },
        last90: { social: Math.round(revenue90rev.social), business: Math.round(revenue90rev.business), total: Math.round(revenue90rev.social + revenue90rev.business) },
      },
      mrr: { total: totalMRR, social: mrrSocial / 100, business: mrrBusiness / 100 },
      arpm,
      tierBreakdown,
      activeByTier,
      revenueTrend,
      members: {
        totalActive: totalActiveSubs,
        newThisMonth,
        newLastMonth,
        canceledThisMonth,
        canceledLastMonth,
        netGrowth: netGrowthThisMonth,
        pendingCancellations: Math.max(pendingCancellations, dbPending),
        byStatus: memberCounts,
      },
      churn: {
        rateThisMonth: churnRateThisMonth,
        rateLastMonth: churnRateLastMonth,
        byTier: canceledByTier,
        avgLifetimeMonths,
        revenueChurn,
        trend: churnTrend,
      },
      pastDue: { count: pastDueSubs.length, amount: pastDueSubs.reduce((s, sub) => s + (sub.items?.data?.[0]?.price?.unit_amount || 0), 0) / 100 },
      projections,
      recentPayments: allRecentItems,
      activeMembers,
      newMembers,
      canceledMembers,
      pastDueMembers,
      pendingCancelMembers,
    };

    // Upsert cache
    const fetchedAt = new Date().toISOString();
    await supabase
      .from("financial_cache")
      .upsert(
        { cache_key: CACHE_KEY, data: payload, fetched_at: fetchedAt },
        { onConflict: "cache_key" }
      );

    log("Data cached successfully");

    return new Response(JSON.stringify({ ...payload, cached: false, last_updated: fetchedAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function fetchAllSubs(stripe: Stripe, status: string, limit = 200): Promise<Stripe.Subscription[]> {
  const all: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore && all.length < limit) {
    const batch = await stripe.subscriptions.list({
      status: status as any,
      limit: Math.min(100, limit - all.length),
      starting_after: startingAfter,
      expand: ["data.items.data.price", "data.customer"],
    });
    all.push(...batch.data);
    hasMore = batch.has_more;
    if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
  }
  return all;
}

async function fetchAllInvoices(stripe: Stripe, sinceTs: number): Promise<Stripe.Invoice[]> {
  const all: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore && all.length < 500) {
    const batch = await stripe.invoices.list({
      limit: 100,
      starting_after: startingAfter,
      created: { gte: sinceTs },
      status: "paid",
    });
    all.push(...batch.data);
    hasMore = batch.has_more;
    if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
  }
  return all;
}

