/**
 * Google Wallet membership pass is created by the Supabase Edge Function
 * `generate-wallet-pass` (folder: supabase/functions/generate-wallet-pass).
 *
 * Client: `supabase.functions.invoke('generate-wallet-pass', { body: { platform: 'google' } })`
 * resolves to: `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-wallet-pass`
 *
 * Required Edge secrets (Deno env):
 * - GOOGLE_WALLET_ISSUER_ID
 * - GOOGLE_WALLET_PRIVATE_KEY
 * - GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL
 * Optional: GOOGLE_WALLET_JWT_ORIGINS (comma-separated) for Save-to-Wallet JWT `origins`.
 */
export const GENERATE_WALLET_PASS_FUNCTION = 'generate-wallet-pass' as const;

export function generateWalletPassFunctionsUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return '';
  return `${base}/functions/v1/${GENERATE_WALLET_PASS_FUNCTION}`;
}
