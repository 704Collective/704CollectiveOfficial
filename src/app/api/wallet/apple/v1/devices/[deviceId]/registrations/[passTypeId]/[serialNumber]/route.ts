import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = (step: string, details?: unknown) => {
  const suffix = details !== undefined ? ' - ' + JSON.stringify(details) : '';
  console.log('[APPLE-WALLET-REGISTER] ' + step + suffix);
};

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

// Verifies the Authorization: ApplePass {token} header against
// apple_wallet_passes.auth_token for the given serial. Returns true if valid.
async function verifyPassToken(
  supabase: ReturnType<typeof supabaseAdmin>,
  serialNumber: string,
  authHeader: string | null
): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('ApplePass ')) return false;
  const token = authHeader.slice('ApplePass '.length).trim();
  if (!token) return false;
  const { data, error } = await supabase
    .from('apple_wallet_passes')
    .select('auth_token')
    .eq('serial_number', serialNumber)
    .maybeSingle();
  if (error || !data) return false;
  return data.auth_token === token;
}

type RouteContext = {
  params: Promise<{ deviceId: string; passTypeId: string; serialNumber: string }>;
};

// POST: register a device to receive updates for a pass.
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { deviceId, serialNumber } = await context.params;
    const supabase = supabaseAdmin();

    const ok = await verifyPassToken(supabase, serialNumber, req.headers.get('Authorization'));
    if (!ok) {
      log('register: auth failed', { deviceId, serialNumber });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const pushToken = body && typeof body === 'object' ? body.pushToken : null;
    if (!pushToken || typeof pushToken !== 'string') {
      log('register: missing pushToken', { deviceId, serialNumber });
      return new NextResponse('Bad Request', { status: 400 });
    }

    const { data: existing } = await supabase
      .from('apple_wallet_registrations')
      .select('id')
      .eq('device_id', deviceId)
      .eq('serial_number', serialNumber)
      .maybeSingle();

    const { error: upsertErr } = await supabase
      .from('apple_wallet_registrations')
      .upsert(
        { device_id: deviceId, serial_number: serialNumber, push_token: pushToken },
        { onConflict: 'device_id,serial_number' }
      );
    if (upsertErr) {
      log('register: upsert failed', { error: upsertErr.message });
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    log('register: ok', { deviceId, serialNumber, alreadyExisted: !!existing });
    return new NextResponse(null, { status: existing ? 200 : 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('register: error', message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// DELETE: unregister a device from a pass.
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { deviceId, serialNumber } = await context.params;
    const supabase = supabaseAdmin();

    const ok = await verifyPassToken(supabase, serialNumber, req.headers.get('Authorization'));
    if (!ok) {
      log('unregister: auth failed', { deviceId, serialNumber });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { error: delErr } = await supabase
      .from('apple_wallet_registrations')
      .delete()
      .eq('device_id', deviceId)
      .eq('serial_number', serialNumber);
    if (delErr) {
      log('unregister: delete failed', { error: delErr.message });
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    log('unregister: ok', { deviceId, serialNumber });
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('unregister: error', message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}