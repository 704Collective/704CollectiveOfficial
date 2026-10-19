// Browser/server mirror of supabase/functions/_shared/emailCheckStatus.ts.
// Keep in lockstep. check-email-status imports the Deno copy.
// people.override_paying is not an input.

import { isRsvpEligibleMember, type RsvpEligibilityProfile } from './rsvpEligibility';

export type EmailCheckStatus = 'active_member' | 'existing_contact' | 'new';

export function emailCheckStatus(opts: {
  profile: RsvpEligibilityProfile | null | undefined;
  hasPerson: boolean;
  nowMs?: number;
}): EmailCheckStatus {
  if (isRsvpEligibleMember(opts.profile, opts.nowMs)) return 'active_member';
  if (opts.profile || opts.hasPerson) return 'existing_contact';
  return 'new';
}
