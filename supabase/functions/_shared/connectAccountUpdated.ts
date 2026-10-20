import type Stripe from "https://esm.sh/stripe@18.5.0";

// account.updated body is the stripe-webhook case block, unchanged.
// stripe-webhook still has its own copy and is not redeployed.

// deno-lint-ignore no-explicit-any
type AnySupabase = any;

export async function applyAccountUpdated(
  event: { type: string; data: { object: Stripe.Account } },
  supabase: AnySupabase,
  log: (step: string, details?: unknown) => void,
): Promise<void> {
  switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const ambassadorId = account.metadata?.ambassador_id;
        // Member-referrer Connect accounts carry referrer_profile_id instead.
        // Same status derivation as ambassadors, written to member_payout_accounts.
        // NOTE: the Stripe endpoint must be subscribed to account.updated (Connect)
        // for either branch to ever run; today it is not (see cursor_report_phase2build.md).
        const referrerProfileId = account.metadata?.referrer_profile_id;
        if (!ambassadorId && referrerProfileId) {
          let memberStatus = 'onboarding';
          if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
            memberStatus = 'active';
          } else if (account.requirements?.disabled_reason) {
            memberStatus = 'restricted';
          }
          const memberUpdates: Record<string, unknown> = {
            stripe_account_id: account.id,
            stripe_account_status: memberStatus,
          };
          if (memberStatus === 'active') {
            const { data: mpa } = await supabase
              .from('member_payout_accounts')
              .select('stripe_onboarding_completed_at')
              .eq('profile_id', referrerProfileId)
              .maybeSingle();
            if (!mpa?.stripe_onboarding_completed_at) {
              memberUpdates.stripe_onboarding_completed_at = new Date().toISOString();
            }
          }
          const { error: mpaErr } = await supabase
            .from('member_payout_accounts')
            .upsert({ profile_id: referrerProfileId, ...memberUpdates }, { onConflict: 'profile_id' });
          if (mpaErr) {
            log("Failed to update member payout account from account.updated", { referrerProfileId, error: mpaErr.message });
          } else {
            log("Member payout account status updated", { referrerProfileId, status: memberStatus });
          }
          break;
        }
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
  }
}
