// Where does a member-referrer's $250 go?
//
// Resolution order (documented, deliberate):
//   1. member_payout_accounts for the profile, status 'active' with an account id.
//      The member set this up themselves; it wins.
//   2. ambassadors row with profile_id = the profile, stripe_account_status
//      'active' with an account id. Reuse rule: a referrer who is already an
//      ambassador with a working Connect account is paid there and is never
//      asked to onboard a second Express account.
//   3. None: the row is held (payout_status stays 'owed') and the nudge fires.
//
// Read-only. Shared by stripe-webhook (to decide whether the "set up payouts"
// copy is needed) and the Monday payout run (to pick the transfer destination).

// deno-lint-ignore no-explicit-any
type AnySupabase = any;

export type PayoutDestination =
  | { source: "member" | "ambassador"; accountId: string }
  | { source: null; memberStatus: string | null; ambassadorStatus: string | null };

export async function resolveMemberPayoutDestination(
  supabase: AnySupabase,
  profileId: string,
): Promise<PayoutDestination> {
  const { data: own } = await supabase
    .from("member_payout_accounts")
    .select("stripe_account_id, stripe_account_status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (own?.stripe_account_id && own.stripe_account_status === "active") {
    return { source: "member", accountId: own.stripe_account_id as string };
  }

  const { data: amb } = await supabase
    .from("ambassadors")
    .select("stripe_account_id, stripe_account_status")
    .eq("profile_id", profileId)
    .not("stripe_account_id", "is", null)
    .order("stripe_onboarding_completed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (amb?.stripe_account_id && amb.stripe_account_status === "active") {
    return { source: "ambassador", accountId: amb.stripe_account_id as string };
  }

  return {
    source: null,
    memberStatus: (own?.stripe_account_status as string | null) ?? null,
    ambassadorStatus: (amb?.stripe_account_status as string | null) ?? null,
  };
}

/** True when the member should be shown the Connect onboarding CTA. */
export function needsPayoutSetup(dest: PayoutDestination): boolean {
  return dest.source === null;
}
