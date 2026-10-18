import { isRsvpEligibleMember, type RsvpEligibilityProfile } from "./rsvpEligibility.ts";

export type CalendarFeedProfile = RsvpEligibilityProfile & {
  member_type?: string | null;
};

export type CalendarFeedScope = "social" | "business" | "all" | "rsvp_only";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCalendarFeedTokenFormat(token: string): boolean {
  return UUID_RE.test(token);
}

export function isScopeAuthorized(scope: CalendarFeedScope, memberType: string | null): boolean {
  // business + all are gated to business-tier members; social + rsvp_only are
  // open to any eligible member (social / business / partner).
  if (scope === "business" || scope === "all") {
    return memberType === "business";
  }
  return true;
}

/**
 * Membership HTTP status for a known token.
 * Eligible member (same rule as RSVP) → 200; membership truly over → 410.
 * Scope/tier 403 is applied after this in calendarFeedHttpStatus.
 */
export function calendarFeedMembershipHttpStatus(
  p: CalendarFeedProfile,
  nowMs = Date.now(),
): 200 | 410 {
  return isRsvpEligibleMember(p, nowMs) ? 200 : 410;
}

/** Full gate used by calendar-feed (uuid / unknown / member / tier). Rate-limit stays in the function. */
export function calendarFeedHttpStatus(opts: {
  token: string;
  profile: CalendarFeedProfile | null;
  scope: CalendarFeedScope;
  nowMs?: number;
}): 200 | 400 | 403 | 404 | 410 {
  if (!isCalendarFeedTokenFormat(opts.token)) return 400;
  if (!opts.profile) return 404;
  const membership = calendarFeedMembershipHttpStatus(opts.profile, opts.nowMs);
  if (membership === 410) return 410;
  if (!isScopeAuthorized(opts.scope, opts.profile.member_type ?? null)) return 403;
  return 200;
}
