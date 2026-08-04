import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  precheckCompInvite,
  runCompInvite,
  serviceAdmin,
  type CompInviteBody,
} from '@/lib/admin/comp-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (me?.role !== 'super_admin') {
    return { error: NextResponse.json({ ok: false, error: 'Super admin required' }, { status: 403 }) };
  }
  return { user };
}

function siteBaseFrom(req: NextRequest, origin?: string | null): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    origin ||
    req.headers.get('origin') ||
    'https://704collective.com'
  ).replace(/\/$/, '');
}

/** Pre-check an invitee email before sending. */
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const email = req.nextUrl.searchParams.get('email');
  if (!email?.trim()) {
    return NextResponse.json({ ok: false, error: 'email query param is required' }, { status: 400 });
  }

  try {
    const admin = serviceAdmin();
    const result = await precheckCompInvite(admin, email);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comp-invite] GET', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Create or upgrade a comp'd member and send the welcome / activate email. */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  let body: CompInviteBody;
  try {
    body = (await req.json()) as CompInviteBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const admin = serviceAdmin();
    const siteBase = siteBaseFrom(req, body.origin);
    const result = await runCompInvite(admin, body, siteBase);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 400 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comp-invite] POST', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
