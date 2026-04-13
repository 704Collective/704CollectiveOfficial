import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // Verify the caller is an authenticated admin via the server-side Supabase client
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { email, full_name, firstName, lastName, origin } = body;

  // Accept either full_name or separate firstName/lastName from the UI
  const resolvedName = full_name?.trim()
    || (firstName && lastName ? `${firstName.trim()} ${lastName.trim()}` : undefined)
    || firstName?.trim()
    || undefined;

  if (!email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[admin/invite] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  console.log('[admin/invite] service role key present:', !!serviceRoleKey);
  const edgeFnUrl = `${supabaseUrl}/functions/v1/admin-invite`;

  const edgeRes = await fetch(edgeFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Shared secret — never exposed to the browser
      'x-admin-secret': serviceRoleKey,
    },
    body: JSON.stringify({
      email: email.trim(),
      full_name: resolvedName,
      origin: origin ?? req.headers.get('origin') ?? 'https://704collective.com',
    }),
  });

  const data = await edgeRes.json();

  if (!edgeRes.ok) {
    return NextResponse.json({ error: data.error || 'Failed to send invite' }, { status: edgeRes.status });
  }

  return NextResponse.json(data, { status: 200 });
}
