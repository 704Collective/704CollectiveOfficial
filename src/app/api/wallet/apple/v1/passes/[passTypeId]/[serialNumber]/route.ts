import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = (step: string, details?: unknown) => {
  const suffix = details !== undefined ? ' - ' + JSON.stringify(details) : '';
  console.log('[APPLE-WALLET-GETPASS] ' + step + suffix);
};

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

type RouteContext = {
  params: Promise<{ passTypeId: string; serialNumber: string }>;
};

// GET: return the latest signed .pkpass for a serial.
// Apple's device calls this after a push notification.
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { serialNumber } = await context.params;
    const supabase = supabaseAdmin();

    // Verify Authorization: ApplePass {token} against apple_wallet_passes.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('ApplePass ')) {
      log('auth missing or malformed', { serialNumber });
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const token = authHeader.slice('ApplePass '.length).trim();
    const { data: passRow, error: passErr } = await supabase
      .from('apple_wallet_passes')
      .select('auth_token')
      .eq('serial_number', serialNumber)
      .maybeSingle();
    if (passErr || !passRow) {
      log('pass not found', { serialNumber, error: passErr?.message });
      return new NextResponse('Not Found', { status: 404 });
    }
    if (passRow.auth_token !== token) {
      log('auth token mismatch', { serialNumber });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Call generate-apple-wallet-pass via the service-role path to get a
    // freshly signed pass for this serial.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceKey = process.env.WALLET_PUSH_SECRET as string;
    const genResponse = await fetch(
      supabaseUrl + '/functions/v1/generate-apple-wallet-pass',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serialNumber }),
      }
    );

    if (!genResponse.ok) {
      const errText = await genResponse.text().catch(() => '');
      log('generate-apple-wallet-pass failed', { serialNumber, status: genResponse.status, errText });
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    const pkpassBuffer = await genResponse.arrayBuffer();
    log('pass regenerated', { serialNumber, size: pkpassBuffer.byteLength });

    return new NextResponse(pkpassBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="704-collective.pkpass"',
        'Last-Modified': new Date().toUTCString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}