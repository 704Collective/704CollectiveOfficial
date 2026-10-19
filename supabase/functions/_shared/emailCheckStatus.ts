// Guest-checkout email gate. Same membership rule as RSVP and calendar-feed.
// people.override_paying is a stale import flag and is not an input.

import {
  isRsvpEligibleMember,
  type RsvpEligibilityProfile,
} from "./rsvpEligibility.ts";

export type EmailCheckStatus = "active_member" | "existing_contact" | "new";

export function emailCheckStatus(opts: {
  profile: RsvpEligibilityProfile | null | undefined;
  hasPerson: boolean;
  nowMs?: number;
}): EmailCheckStatus {
  if (isRsvpEligibleMember(opts.profile, opts.nowMs)) return "active_member";
  if (opts.profile || opts.hasPerson) return "existing_contact";
  return "new";
}
