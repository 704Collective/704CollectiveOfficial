import { isCompedMember, type CompedFields } from '@/lib/compedMember';

export type CalendarFeedProfile = CompedFields & {
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
};

const LIVE_STATUSES = new Set(['active', 'paused', 'trialing', 'past_due']);

/** Discussion-like "still a member" — never convert these 403s to 410. */
export function isDiscussionLikeMember(
  p: CalendarFeedProfile,
  nowMs = Date.now(),
): boolean {
  const s = (p.subscription_status ?? '').toLowerCase();
  if (LIVE_STATUSES.has(s)) return true;
  if ((s === 'canceled' || s === 'cancelled') && p.subscription_ends_at) {
    const ends = Date.parse(p.subscription_ends_at);
    if (!Number.isNaN(ends) && ends > nowMs) return true;
  }
  return isCompedMember(p);
}

/**
 * Today's membership gate: only `subscription_status === "active"` continues to 200.
 * Every other known token is 403 today. We swap that 403 to 410 only when the
 * person is no longer a member under the discussion/comped rule.
 */
export function calendarFeedMembershipHttpStatus(
  p: CalendarFeedProfile,
  nowMs = Date.now(),
): 200 | 403 | 410 {
  const s = (p.subscription_status ?? '').toLowerCase();
  if (s === 'active') return 200;
  if (isDiscussionLikeMember(p, nowMs)) return 403;
  return 410;
}
