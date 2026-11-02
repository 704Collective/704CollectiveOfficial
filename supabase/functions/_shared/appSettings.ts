// Feature flags in public.app_settings. Service role reads the table directly.
//
// business_referral_payouts_enabled defaults false. While false, record who
// referred whom at $0 / payout_status 'disabled'. Do not backfill those rows
// when the flag is later flipped on.

export async function businessReferralPayoutsEnabled(
  // deno-lint-ignore no-explicit-any
  supabase: { from: (table: string) => any },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "business_referral_payouts_enabled")
    .maybeSingle();
  if (error) {
    console.error("[appSettings] flag read failed, defaulting OFF:", error.message);
    return false;
  }
  return data?.value === true;
}
