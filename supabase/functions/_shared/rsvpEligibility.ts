// Member check shared by every RSVP door and calendar-feed.
//
// "Can this person RSVP as a member?" — not per-event, not tier.
// The per-event overlay is membershipEndsBeforeEvent in membershipWindow.ts
// (MEMBERSHIP_ENDS_BEFORE_EVENT): a pending-cancel member may not take a seat
// at an event that starts after profiles.subscription_ends_at.
//
// Access is Stripe-ish status + paid window + membership_override.
// comp_reason is a historical label (comp can have ended while the string
// remains) and is NOT consulted. Win-back suppression stays in compedMember.ts.

export type RsvpEligibilityProfile = {
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
  membership_override?: boolean | null;
};

const RSVP_LIVE_STATUSES = new Set(["active", "paused", "trialing", "past_due"]);

export function isRsvpEligibleMember(
  p: RsvpEligibilityProfile | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!p) return false;
  if (p.membership_override === true) return true;
  const s = (p.subscription_status ?? "").toLowerCase();
  if (RSVP_LIVE_STATUSES.has(s)) return true;
  if ((s === "canceled" || s === "cancelled") && p.subscription_ends_at) {
    const ends = Date.parse(p.subscription_ends_at);
    if (!Number.isNaN(ends) && ends > nowMs) return true;
  }
  return false;
}
