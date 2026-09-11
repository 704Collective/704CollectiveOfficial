import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolveMemberPayoutDestination } from "../_shared/memberPayoutDestination.ts";

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

// -- Member referral pass -----------------------------------------------------
//
// Pays the `referrals` ledger (member-to-member business referrals, $250).
// Lessons from the ambassador fixes are welded in:
//   * Selection is status='converted' AND payout_status='owed' AND
//     stripe_transfer_id IS NULL, and the row is stamped on the same column.
//   * The terminal words are the ones the table's CHECK allows: status 'paid',
//     payout_status 'sent'. Nothing here writes a value the constraint rejects.
//   * stripe_transfer_id, status, payout_status and payout_sent_at land in ONE
//     update, guarded by `.is('stripe_transfer_id', null)`, BEFORE the log row
//     or the email, so a partial failure can never leave a paid row selectable.
//   * The Stripe idempotency key is a same-run retry guard only (Stripe forgets
//     keys after 24h); the stamped transfer id is what protects next Monday.
//   * Referrers with no usable Connect account are skipped and HELD (row stays
//     owed) and that held list drives the "set up payouts" nudge.

interface MemberReferralRow {
  id: string;
  referrer_profile_id: string | null;
  referred_name: string | null;
  referred_email: string | null;
  amount_cents: number;
  created_at: string;
}

interface MemberPassSummary {
  processed: { referrers: number; referrals: number; totalCents: number };
  held: Array<{ referrerProfileId: string; referralIds: string[]; reason: string }>;
  errors: Array<{ referralId: string; error: string }>;
}

async function runMemberReferralPass(
  stripe: Stripe,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  supabaseUrl: string,
): Promise<MemberPassSummary> {
  const mlog = (step: string, details?: unknown) => log(`[member] ${step}`, details);
  const summary: MemberPassSummary = {
    processed: { referrers: 0, referrals: 0, totalCents: 0 },
    held: [],
    errors: [],
  };

  const { data: rows, error: qErr } = await supabase
    .from("referrals")
    .select("id, referrer_profile_id, referred_name, referred_email, amount_cents, created_at")
    .eq("status", "converted")
    .eq("payout_status", "owed")
    .is("stripe_transfer_id", null)
    .order("referrer_profile_id")
    .order("created_at");

  if (qErr) {
    mlog("Selection failed", { error: qErr.message });
    summary.errors.push({ referralId: "(selection)", error: qErr.message });
    return summary;
  }

  const list = (rows ?? []) as MemberReferralRow[];
  mlog(`Found ${list.length} owed member referrals`);
  if (list.length === 0) return summary;

  const byReferrer = new Map<string, MemberReferralRow[]>();
  for (const r of list) {
    if (!r.referrer_profile_id) {
      summary.errors.push({ referralId: r.id, error: "referrer_profile_id is null" });
      continue;
    }
    if (!byReferrer.has(r.referrer_profile_id)) byReferrer.set(r.referrer_profile_id, []);
    byReferrer.get(r.referrer_profile_id)!.push(r);
  }

  for (const [referrerId, refs] of byReferrer) {
    const dest = await resolveMemberPayoutDestination(supabase, referrerId);
    if (dest.source === null) {
      const reason = `No usable Connect account (member=${dest.memberStatus ?? "none"}, ambassador=${dest.ambassadorStatus ?? "none"})`;
      mlog(`Holding ${refs.length} referral(s) for ${referrerId}: ${reason}`);
      summary.held.push({ referrerProfileId: referrerId, referralIds: refs.map((r) => r.id), reason });
      await nudgePayoutSetup(supabase, referrerId, refs);
      continue;
    }

    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", referrerId)
      .maybeSingle();

    summary.processed.referrers++;
    const paidThisRun: Array<{ refereeName: string; date: string; amountCents: number }> = [];
    let referrerTotal = 0;

    for (const ref of refs) {
      const amount = ref.amount_cents;
      if (!amount || amount <= 0) {
        summary.errors.push({ referralId: ref.id, error: "amount_cents resolved to 0" });
        continue;
      }
      const refereeName = ref.referred_name || ref.referred_email || "a new member";
      try {
        const transfer = await stripe.transfers.create(
          {
            amount,
            currency: "usd",
            destination: dest.accountId,
            description: `Member referral payout for ${refereeName}`,
            metadata: {
              ledger: "referrals",
              referral_id: ref.id,
              referrer_profile_id: referrerId,
              referee_email: ref.referred_email ?? "",
              destination_source: dest.source,
              source: "weekly-cron",
            },
          },
          { idempotencyKey: `member-payout-${ref.id}` },
        );

        const sentAt = new Date().toISOString();

        // ONE update, before anything else, guarded on the column we select on.
        const { data: stamped, error: stampErr } = await supabase
          .from("referrals")
          .update({
            status: "paid",
            payout_status: "sent",
            payout_sent_at: sentAt,
            stripe_transfer_id: transfer.id,
          })
          .eq("id", ref.id)
          .is("stripe_transfer_id", null)
          .select("id");

        if (stampErr) {
          // Money moved but the ledger did not record it. Log loudly; the
          // transfer id is in Stripe metadata for reconciliation.
          mlog(`CRITICAL: transfer ${transfer.id} succeeded but referrals stamp failed`, { referralId: ref.id, error: stampErr.message });
          summary.errors.push({ referralId: ref.id, error: `stamp failed after transfer ${transfer.id}: ${stampErr.message}` });
          continue;
        }
        if (!stamped || stamped.length === 0) {
          mlog(`CRITICAL: transfer ${transfer.id} succeeded but row was already stamped`, { referralId: ref.id });
          summary.errors.push({ referralId: ref.id, error: `row already stamped when transfer ${transfer.id} landed` });
          continue;
        }

        const { error: logErr } = await supabase.from("member_payouts").insert({
          referral_id: ref.id,
          referrer_profile_id: referrerId,
          amount_cents: amount,
          stripe_transfer_id: transfer.id,
          destination_source: dest.source,
          status: "sent",
          sent_at: sentAt,
        });
        if (logErr) mlog(`Payout log insert failed for ${ref.id} (non-blocking)`, { error: logErr.message });

        paidThisRun.push({ refereeName, date: formatDate(ref.created_at), amountCents: amount });
        referrerTotal += amount;
        summary.processed.referrals++;
        summary.processed.totalCents += amount;
        mlog(`Paid referral ${ref.id}`, { referrerId, destination: dest.source, amountCents: amount, transferId: transfer.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        mlog(`Error processing referral ${ref.id}`, { error: msg });
        summary.errors.push({ referralId: ref.id, error: msg });
      }
    }

    if (paidThisRun.length > 0 && referrer?.email) {
      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to: referrer.email,
            template: "member-referral-payout",
            skipCc: true,
            data: {
              name: referrer.full_name ?? "Member",
              totalCents: referrerTotal,
              payouts: paidThisRun,
              transferArrivalEstimate: getTransferArrivalEstimate(),
            },
          }),
        });
        if (!emailRes.ok) mlog(`Payout email failed for ${referrerId}`, { status: emailRes.status });
        else mlog(`Payout email sent`, { referrerId });
      } catch (emailErr) {
        mlog(`Payout email error (non-blocking)`, { error: emailErr instanceof Error ? emailErr.message : String(emailErr) });
      }
    }
  }

  return summary;
}

/** Weekly bell nudge for a referrer with owed money and no usable Connect account. Bell only; the email went out at conversion. */
// deno-lint-ignore no-explicit-any
async function nudgePayoutSetup(supabase: any, referrerId: string, refs: MemberReferralRow[]) {
  try {
    const { data: recent } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", referrerId)
      .eq("type", "payout_setup")
      .eq("is_read", false)
      .limit(1);
    if (recent && recent.length > 0) return; // one unread nudge at a time
    const owedCents = refs.reduce((s, r) => s + (r.amount_cents || 0), 0);
    await supabase.from("notifications").insert({
      user_id: referrerId,
      type: "payout_setup",
      notification_type: "payout_setup",
      title: `$${(owedCents / 100).toFixed(0)} is waiting for you`,
      message: "Set up payouts on your dashboard to receive your referral reward on the next Monday run.",
      action_url: "/dashboard?tab=referrals",
    });
  } catch (e) {
    log(`[member] nudge failed (non-blocking)`, { error: e instanceof Error ? e.message : String(e) });
  }
}

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
  // Exact match only. Prefix checks and unverified JWT payload decoding both
  // accept forged tokens - neither proves the caller holds a real secret.
  const altSecretKey = Deno.env.get("SB_SECRET_KEY") ?? "";
  const isServiceRole =
    (serviceRoleKey.length > 0 && token === serviceRoleKey) ||
    (altSecretKey.length > 0 && token === altSecretKey);

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

    // The member-referral pass (step 5) runs even when there is no ambassador
    // work, so an empty ambassador set no longer returns early.

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

    // 5. Member referral pass (referrals ledger) ------------------------------
    // Separate table, separate selection, separate idempotency keys. Ambassador
    // rows above are never touched by this pass.

    const member = await runMemberReferralPass(stripe, supabase, supabaseUrl);

    // 4. Return summary -------------------------------------------------------

    const summary = {
      ok: true,
      processed: { ambassadors: totalAmbassadors, referrals: totalReferrals, totalCents },
      skipped,
      errors,
      member,
      timestamp: now,
    };

    log("Run complete", { ...summary.processed, member: member.processed });

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