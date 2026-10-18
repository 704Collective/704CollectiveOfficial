// Browser/server mirror of supabase/functions/_shared/rsvpEligibility.ts.
// Keep in lockstep — calendar-feed and the RSVP doors import the Deno copy.
// Access does not use comp_reason (historical label). Win-back stays in compedMember.ts.

export type RsvpEligibilityProfile = {
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
  membership_override?: boolean | null;
};

const RSVP_LIVE_STATUSES = new Set(['active', 'paused', 'trialing', 'past_due']);

export function isRsvpEligibleMember(
  p: RsvpEligibilityProfile | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!p) return false;
  if (p.membership_override === true) return true;
  const s = (p.subscription_status ?? '').toLowerCase();
  if (RSVP_LIVE_STATUSES.has(s)) return true;
  if ((s === 'canceled' || s === 'cancelled') && p.subscription_ends_at) {
    const ends = Date.parse(p.subscription_ends_at);
    if (!Number.isNaN(ends) && ends > nowMs) return true;
  }
  return false;
}
