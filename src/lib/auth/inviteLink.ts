// Invite-links wave — Next.js twin of supabase/functions/_shared/inviteLink.ts.
// Admin-generated links go through /auth/callback (server-side verifyOtp on the
// hashed token) instead of GoTrue's implicit action_link, which the PKCE browser
// client refuses. Keep in lockstep with the Deno copy.
export type GenerateLinkData = { properties?: { hashed_token?: string | null } | null } | null | undefined;

const HEX = /^[a-f0-9]{20,}$/i;

export function buildInviteLink(
  siteBase: string,
  linkData: GenerateLinkData,
  type: 'recovery' | 'magiclink' | 'invite' | 'signup',
  next?: string,
): string | null {
  const token = linkData?.properties?.hashed_token;
  if (!token || !HEX.test(token)) return null;
  const root = siteBase.replace(/\/$/, '');
  const qs = `token_hash=${encodeURIComponent(token)}&type=${type}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  return `${root}/auth/callback?${qs}`;
}
