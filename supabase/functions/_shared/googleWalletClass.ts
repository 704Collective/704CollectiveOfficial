// Google Wallet class / object IDs. Keep in sync with generate-wallet-pass
// and update-google-wallet-pass. Unit tests import this file.

export const DEFAULT_GOOGLE_WALLET_JWT_ORIGINS = [
  "https://704collective.com",
  "https://www.704collective.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
] as const;

export function googleWalletClassSuffix(
  memberType: string | null | undefined,
): "704collective_business" | "704collective_social" {
  return memberType === "business" ? "704collective_business" : "704collective_social";
}

export function googleWalletClassId(
  issuerId: string,
  memberType: string | null | undefined,
): string {
  return `${issuerId}.${googleWalletClassSuffix(memberType)}`;
}

export function googleWalletObjectId(issuerId: string, profileId: string): string {
  return `${issuerId}.member_${profileId.replace(/-/g, "_")}`;
}

export function googleWalletJwtOrigins(raw: string | null | undefined): string[] {
  if (raw && raw.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [...DEFAULT_GOOGLE_WALLET_JWT_ORIGINS];
}
