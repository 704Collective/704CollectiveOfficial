import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = (step: string, details?: unknown) => {
  const suffix = details !== undefined ? ' - ' + JSON.stringify(details) : '';
  console.log('[APPLE-WALLET-LOG] ' + step + suffix);
};

// Apple Wallet web service: POST /api/wallet/apple/v1/log
// PassKit posts device-side diagnostic messages here. Accept and record them.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const logs = body && typeof body === 'object' ? body.logs : null;
    if (Array.isArray(logs)) {
      for (const line of logs) {
        log('device', { message: typeof line === 'string' ? line : JSON.stringify(line) });
      }
    } else {
      log('received non-standard body', { body });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', message);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}