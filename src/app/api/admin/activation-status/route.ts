import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin-only read of a member's activation state (has this account ever signed
// in?). auth.users is never exposed to the browser directly; the service-role
// lookup happens here, after the caller's admin role is verified, and only the
// three fields the Contacts page shows are returned.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const asCaller = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: { user }, error: authErr } = await asCaller.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!caller || !['admin', 'super_admin'].includes(caller.role ?? '')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const userId = req.nextUrl.searchParams.get('user_id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const u = data.user as { last_sign_in_at?: string | null; recovery_sent_at?: string | null; email_confirmed_at?: string | null };
    return NextResponse.json({
      never_signed_in: !u.last_sign_in_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      recovery_sent_at: u.recovery_sent_at ?? null,
    });
  } catch (err) {
    console.error('[ACTIVATION-STATUS]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
