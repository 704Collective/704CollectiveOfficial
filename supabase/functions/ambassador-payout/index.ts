import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// -- Types --------------------------------------------------------------------

interface AmbassadorRow {
  id: string;
  full_name: string;
  email: string;
  stripe_account_id: string | null;
  stripe_account_status: string | null;
  social_reward_cents: number;
  business_reward_cents: number;
}

interface ReferralRow {
  id: string;
  ambassador_id: string;
  referred_email: string | null;
  referred_full_name: string | null;
  tier: string | null;
  reward_cents: number | null;
  payout_status: string | null;
  created_at: string;
  ambassador: AmbassadorRow;
}

interface SkipEntry {
  ambassadorId: string;
  name: string;
  reason: string;
}

interface ErrorEntry {
  referralId: string;
  error: string;
}

// -- Helpers ------------------------------------------------------------------

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[AMBASSADOR-PAYOUT] ${step}${d}`);
};

/** Returns a string like "by Wednesday, March 18, 2026" (today + 2 business days) */
function getTransferArrivalEstimate(): string {
  const date = new Date();
  let daysAdded = 0;
  while (daysAdded < 2) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) daysAdded++;
  }
  return `by ${date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
}

/** Formats an ISO date string like "March 12, 2026" */
function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getStripe() {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// -- Main handler -------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Service-role auth check -- only cron/admin can invoke this
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  let isServiceRole = token === serviceRoleKey;
  if (!isServiceRole && token.startsWith("sb_secret_")) isServiceRole = true;
  if (!isServiceRole && token.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const supabaseRef = (Deno.env.get("SUPABASE_URL") || "").replace("https://", "").split(".")[0];
      if (payload.role === "service_role" && payload.ref === supabaseRef) isServiceRole = true;
    } catch (_e) { /* ignore */ }
  }

  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  log("Starting weekly payout run", { timestamp: now });

  const skipped: SkipEntry[] = [];
  const errors: ErrorEntry[] = [];
  let totalAmbassadors = 0;
  let totalReferrals = 0;
  let totalCents = 0;

  try {
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    // 1. Query all unpaid converted referrals ---------------------------------

    const { data: referrals, error: queryError } = await supabase
      .from("ambassador_referrals")
      .select(`
        id,
        ambassador_id,
        referred_email,
        referred_full_name,
        tier,
        reward_cents,
        payout_status,
        created_at,
        ambassador:ambassadors!ambassador_id (
          id,
          full_name,
          email,
          stripe_account_id,
          stripe_account_status,
          social_reward_cents,
          business_reward_cents
        )
      `)
      .eq("status", "converted")
      .eq("payout_status", "owed")
      .is("stripe_transfer_id", null)
      .order("ambassador_id")
      .order("created_at");

    if (queryError) throw new Error(`Referral query failed: ${queryError.message}`);

    const rows = (referrals ?? []) as unknown as ReferralRow[];
    log(`Found ${rows.length} unpaid referrals`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          processed: { ambassadors: 0, referrals: 0, totalCents: 0 },
          skipped: [],
          errors: [],
          timestamp: now,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Group by ambassador --------------------------------------------------

    const grouped = new Map<string, { ambassador: AmbassadorRow; referrals: ReferralRow[] }>();
    for (const row of rows) {
      const ambId = row.ambassador_id;
      if (!grouped.has(ambId)) {
        grouped.set(ambId, { ambassador: row.ambassador, referrals: [] });
      }
      grouped.get(ambId)!.referrals.push(row);
    }

    // 3. Process each ambassador ----------------------------------------------

    for (const [ambId, { ambassador, referrals: ambReferrals }] of grouped) {
      // Skip if Stripe Connect not active
      if (ambassador.stripe_account_status !== "active") {
        const reason = `Stripe Connect not active (status=${ambassador.stripe_account_status ?? "null"})`;
        log(`Skipping ${ambassador.full_name}: ${reason}`);
        skipped.push({ ambassadorId: ambId, name: ambassador.full_name, reason });
        continue;
      }

      if (!ambassador.stripe_account_id) {
        const reason = "No Stripe account ID";
        log(`Skipping ${ambassador.full_name}: ${reason}`);
        skipped.push({ ambassadorId: ambId, name: ambassador.full_name, reason });
        continue;
      }

      totalAmbassadors++;
      const successfulConversions: Array<{
        refereeName: string;
        refereeEmail: string;
        date: string;
        amountCents: number;
      }> = [];
      let ambassadorTotalCents = 0;

      log(`Processing ${ambassador.full_name} (${ambReferrals.length} referrals)`);

      for (const referral of ambReferrals) {
        // Determine reward: per-referral override > tier default
        let rewardCents: number;
        if (referral.reward_cents != null && referral.reward_cents > 0) {
          rewardCents = referral.reward_cents;
        } else if (referral.tier === "business") {
          rewardCents = ambassador.business_reward_cents ?? 0;
        } else {
          rewardCents = ambassador.social_reward_cents ?? 0;
        }

        if (rewardCents <= 0) {
          log(`Skipping referral ${referral.id}: reward_cents resolved to 0`);
          errors.push({ referralId: referral.id, error: "reward_cents resolved to 0" });
          continue;
        }

        const idempotencyKey = `payout-${referral.id}`;
        const refereeName = referral.referred_full_name || referral.referred_email || "Unknown";
        const refereeEmail = referral.referred_email || "";

        try {
          // Create Stripe Transfer (idempotency key prevents double-pay on retry)
          const transfer = await stripe.transfers.create(
            {
              amount: rewardCents,
              currency: "usd",
              destination: ambassador.stripe_account_id,
              description: `Referral payout for ${refereeName}`,
              metadata: {
                referral_id: referral.id,
                ambassador_id: ambassador.id,
                ambassador_email: ambassador.email,
                referee_email: refereeEmail,
                tier: referral.tier ?? "social",
                source: "weekly-cron",
              },
            },
            { idempotencyKey }
          );

          const sentAt = new Date().toISOString();

          // Insert ambassador_payouts row
          const { error: payoutInsertErr } = await supabase
            .from("ambassador_payouts")
            .insert({
              ambassador_id: ambassador.id,
              referral_id: referral.id,
              amount_cents: rewardCents,
              stripe_transfer_id: transfer.id,
              status: "sent",
              sent_at: sentAt,
              created_at: sentAt,
            });

          if (payoutInsertErr) {
            // Transfer already happened -- log loudly but continue
            log(`Transfer succeeded but payout log insert failed for referral ${referral.id}`, {
              error: payoutInsertErr.message,
            });
          }

          // Update ambassador_referrals to final paid_out state
          const { error: refUpdateErr } = await supabase
            .from("ambassador_referrals")
            .update({
              payout_status: "sent",
              payout_sent_at: sentAt,
              stripe_transfer_id: transfer.id,
              status: "paid_out",
            })
            .eq("id", referral.id);

          if (refUpdateErr) {
            log(`Referral status update failed for ${referral.id}`, {
              error: refUpdateErr.message,
            });
          }

          successfulConversions.push({
            refereeName,
            refereeEmail,
            date: formatDate(referral.created_at),
            amountCents: rewardCents,
          });
          ambassadorTotalCents += rewardCents;
          totalReferrals++;
          totalCents += rewardCents;

          log(`Paid referral ${referral.id}`, {
            ambassador: ambassador.full_name,
            referee: refereeName,
            amountCents: rewardCents,
            transferId: transfer.id,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`Error processing referral ${referral.id}`, { error: msg });
          errors.push({ referralId: referral.id, error: msg });
        }
      }

      // Send weekly summary email (non-critical -- payouts already done) ------
      if (successfulConversions.length > 0) {
        try {
          const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              to: ambassador.email,
              template: "ambassador-weekly-payout",
              skipCc: true,
              data: {
                name: ambassador.full_name,
                totalCents: ambassadorTotalCents,
                conversionCount: successfulConversions.length,
                conversions: successfulConversions,
                transferArrivalEstimate: getTransferArrivalEstimate(),
              },
            }),
          });

          if (!emailRes.ok) {
            const body = await emailRes.text();
            log(`Payout email failed for ${ambassador.full_name}`, { status: emailRes.status, body });
          } else {
            log(`Payout email sent to ${ambassador.email}`);
          }
        } catch (emailErr) {
          log(`Payout email error for ${ambassador.full_name} (non-blocking)`, {
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
          });
        }
      }

      log(`Completed ${ambassador.full_name}`, {
        referrals: successfulConversions.length,
        totalCents: ambassadorTotalCents,
      });
    }

    // 4. Return summary -------------------------------------------------------

    const summary = {
      ok: true,
      processed: { ambassadors: totalAmbassadors, referrals: totalReferrals, totalCents },
      skipped,
      errors,
      timestamp: now,
    };

    log("Run complete", summary.processed);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Fatal error", { error: msg });
    return new Response(
      JSON.stringify({ ok: false, error: msg, timestamp: now }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});