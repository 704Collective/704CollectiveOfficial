// Browser/server mirror of supabase/functions/_shared/rsvpEligibility.ts.
// Keep in lockstep — calendar-feed and the RSVP doors import the Deno copy.

import { isCompedMember, type CompedFields } from '@/lib/compedMember';

export type RsvpEligibilityProfile = CompedFields & {
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
};

const RSVP_LIVE_STATUSES = new Set(['active', 'paused', 'trialing', 'past_due']);

export function isRsvpEligibleMember(
  p: RsvpEligibilityProfile | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!p) return false;
  const s = (p.subscription_status ?? '').toLowerCase();
  if (RSVP_LIVE_STATUSES.has(s)) return true;
  if ((s === 'canceled' || s === 'cancelled') && p.subscription_ends_at) {
    const ends = Date.parse(p.subscription_ends_at);
    if (!Number.isNaN(ends) && ends > nowMs) return true;
  }
  return isCompedMember(p);
}
