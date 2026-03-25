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

const ADAM = 'adam@cltbucketlist.com';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase
    .from('profiles')
    .select('email, see_all_cross_conversations')
    .eq('id', user.id)
    .maybeSingle();

  const emailOk = prof?.email?.toLowerCase() === ADAM;
  const flag = (prof as { see_all_cross_conversations?: boolean } | null)?.see_all_cross_conversations === true;
  if (!emailOk || !flag) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const source = request.nextUrl.searchParams.get('source');
  const id = request.nextUrl.searchParams.get('id');
  if (!source || !id) {
    return NextResponse.json({ error: 'Missing source or id' }, { status: 400 });
  }

  const admin = service();
  if (source === 'admin') {
    const { data: msgs } = await admin
      .from('admin_messages')
      .select('id, content, created_at, sender_id, image_urls, file_urls')
      .eq('conversation_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    return NextResponse.json({ messages: msgs ?? [] });
  }
  if (source === 'member') {
    const { data: msgs } = await admin
      .from('messages')
      .select('id, content, created_at, sender_id, image_urls, file_urls')
      .eq('conversation_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    return NextResponse.json({ messages: msgs ?? [] });
  }
  return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
}
