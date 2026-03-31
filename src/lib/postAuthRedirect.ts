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
 * - Active members, membership override, or applicant non-members → /dashboard
 * - Otherwise → signup (or a caller-provided fallback)
 */
export function postAuthDestination(
  profile: PostAuthProfile | null | undefined,
  options?: { fallbackNoAccess?: string }
): string {
  const isAdmin =
    profile?.role === "admin" || profile?.role === "super_admin";
  if (isAdmin) return "/admin";

  if (profile?.member_type === "partner") return "/partner-portal";

  const isActive =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing" ||
    profile?.membership_override === true;

  const isNonMember =
    profile?.member_type === "social_non_member" ||
    profile?.member_type === "business_non_member" ||
    profile?.member_type === "non_member";

  if (isActive || isNonMember) return "/dashboard";

  return options?.fallbackNoAccess ?? "/signup";
}
