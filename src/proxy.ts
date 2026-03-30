import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Google Wallet: members add passes via `supabase.functions.invoke('generate-wallet-pass')`
 * → `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-wallet-pass`.
 * Edge function env (Supabase secrets): GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_PRIVATE_KEY,
 * GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL; optional GOOGLE_WALLET_JWT_ORIGINS.
 * See `supabase/functions/generate-wallet-pass/index.ts` and `src/lib/walletPass.ts`.
 */

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/admin/crm/:path*',
    '/api/:path*',
    '/auth/callback',
    '/partners',
    '/partners/:path*',
    '/partner-portal',
    '/partner-portal/:path*',
    '/business-portal/:path*',
    '/settings',
    '/settings/:path*',
    '/pending-review',
  ],
};
