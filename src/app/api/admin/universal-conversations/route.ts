import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const admin = service();

  const { data: adminConvs } = await admin
    .from('admin_conversations')
    .select('id, type, title, updated_at, created_by')
    .order('updated_at', { ascending: false })
    .limit(150);

  const { data: memberConvs } = await admin
    .from('conversations')
    .select('id, type, title, updated_at, created_by')
    .order('updated_at', { ascending: false })
    .limit(150);

  const merged = [
    ...(adminConvs ?? []).map((c) => ({
      source: 'admin' as const,
      id: c.id,
      type: c.type,
      title: c.title,
      updated_at: c.updated_at,
      created_by: c.created_by,
    })),
    ...(memberConvs ?? []).map((c) => ({
      source: 'member' as const,
      id: c.id,
      type: c.type,
      title: c.title,
      updated_at: c.updated_at,
      created_by: c.created_by,
    })),
  ].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  const filtered = q
    ? merged.filter(
        (c) =>
          (c.title?.toLowerCase().includes(q) ?? false) ||
          c.type.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      )
    : merged;

  return NextResponse.json({ conversations: filtered.slice(0, 100) });
}
