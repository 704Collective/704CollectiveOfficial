// Invite-links wave — build the emailed sign-in URL from a GoTrue generateLink
// result. GoTrue's action_link redirects with implicit-flow hash tokens that the
// PKCE browser client refuses ("Not a valid PKCE flow url"), so every admin-
// generated link goes through the app's own /auth/callback instead: the server
// verifies the hashed token, sets cookies, and lands the user where `next` says
// (recovery → /reset-password by default).
export type GenerateLinkData = { properties?: { hashed_token?: string | null } | null } | null | undefined;

const HEX = /^[a-f0-9]{20,}$/i;

/** Returns the URL, or null when the token is missing/malformed (callers treat null as "do not send"). */
export function buildInviteLink(
  siteBase: string,
  linkData: GenerateLinkData,
  type: "recovery" | "magiclink" | "invite" | "signup",
  next?: string,
): string | null {
  const token = linkData?.properties?.hashed_token;
  if (!token || !HEX.test(token)) return null;
  const root = siteBase.replace(/\/$/, "");
  const qs = `token_hash=${encodeURIComponent(token)}&type=${type}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return `${root}/auth/callback?${qs}`;
}
