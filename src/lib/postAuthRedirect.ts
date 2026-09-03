/** Shared post-login redirect targets (password, OAuth, middleware). */

export type PostAuthProfile = {
  role?: string | null;
  member_type?: string | null;
  subscription_status?: string | null;
  membership_override?: boolean | null;
};

/**
 * Where to send the user immediately after a successful auth exchange.
 * - Admins → /admin
 * - Partners → /partner-portal
 * - Active members, membership override, past_due, or applicant non-members → /dashboard
 * - Canceled members → /membership-ended
 * - No profile → /signup
 */
export function postAuthDestination(
  profile: PostAuthProfile | null | undefined,
  options?: { fallbackNoAccess?: string; redirectTo?: string }
): string {
  // Item 7: honor an explicit internal redirect (e.g. ?redirect=/events/<id>)
  // when present and safe. Must be a single-slash-rooted path (blocks open
  // redirects like //evil.com). Falls through to normal routing otherwise.
  const wanted = options?.redirectTo;
  if (wanted && wanted.startsWith("/") && !wanted.startsWith("//")) {
    return wanted;
  }
  if (!profile) return options?.fallbackNoAccess ?? "/signup";

  const isAdmin =
    profile.role === "admin" || profile.role === "super_admin";
  if (isAdmin) return "/admin";

  if (profile.member_type === "partner") return "/partner-portal";

  const isActive =
    profile.subscription_status === "active" ||
    profile.subscription_status === "trialing" ||
    profile.membership_override === true;

  const isNonMember =
    profile.member_type === "social_non_member" ||
    profile.member_type === "business_non_member" ||
    profile.member_type === "non_member";

  if (isActive || isNonMember) return "/dashboard";

  // Explicitly canceled — had a membership, canceled it → show membership-ended
  if (
    profile.subscription_status === "canceled" ||
    profile.subscription_status === "cancelled"
  ) {
    return "/membership-ended";
  }

  // Never had a membership (null / undefined / 'inactive' status, no override)
  // → send to /dashboard where NonMemberDashboard renders
  const isNeverMember =
    (!profile.subscription_status || profile.subscription_status === "inactive") &&
    !profile.membership_override;

  if (isNeverMember) return "/dashboard";

  // Failed renewal — still a member; dashboard has Update Billing.
  if (profile.subscription_status === "past_due") return "/dashboard";

  // Any other explicitly bad state (unpaid, etc.) → membership-ended
  return options?.fallbackNoAccess ?? "/membership-ended";
}
