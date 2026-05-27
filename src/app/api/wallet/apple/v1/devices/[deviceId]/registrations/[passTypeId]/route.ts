import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = (step: string, details?: unknown) => {
  const suffix = details !== undefined ? ' - ' + JSON.stringify(details) : '';
  console.log('[APPLE-WALLET-SERIALS] ' + step + suffix);
};

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

type RouteContext = {
  params: Promise<{ deviceId: string; passTypeId: string }>;
};

// GET: list serial numbers of passes registered to this device that have
// been updated since the optional passesUpdatedSince tag.
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { deviceId } = await context.params;
    const supabase = supabaseAdmin();

    const { data: regs, error: regErr } = await supabase
      .from('apple_wallet_registrations')
      .select('serial_number')
      .eq('device_id', deviceId);
    if (regErr) {
      log('registration lookup failed', { error: regErr.message });
      return new NextResponse('Internal Server Error', { status: 500 });
    }
    if (!regs || regs.length === 0) {
      log('no registrations for device', { deviceId });
      return new NextResponse(null, { status: 204 });
    }

    const serials = regs.map((r) => r.serial_number);

    const { data: passes, error: passErr } = await supabase
      .from('apple_wallet_passes')
      .select('serial_number, last_updated')
      .in('serial_number', serials);
    if (passErr) {
      log('pass lookup failed', { error: passErr.message });
      return new NextResponse('Internal Server Error', { status: 500 });
    }

    const updatedSinceParam = req.nextUrl.searchParams.get('passesUpdatedSince');
    const updatedSince = updatedSinceParam ? new Date(updatedSinceParam) : null;

    let matching = passes || [];
    if (updatedSince && !Number.isNaN(updatedSince.getTime())) {
      matching = matching.filter(
        (p) => p.last_updated && new Date(p.last_updated) > updatedSince
      );
    }

    if (matching.length === 0) {
      log('no updated passes since tag', { deviceId, updatedSinceParam });
      return new NextResponse(null, { status: 204 });
    }

    let newest = matching[0].last_updated as string;
    for (const p of matching) {
      if (p.last_updated && new Date(p.last_updated) > new Date(newest)) {
        newest = p.last_updated;
      }
    }

    log('returning serials', { deviceId, count: matching.length });
    return NextResponse.json(
      {
        serialNumbers: matching.map((p) => p.serial_number),
        lastUpdated: newest,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}