import { createClient } from '@supabase/supabase-js';
import { syncInboxForAccount } from '@/lib/social/inbox';

export async function POST(req: Request) {
  const secret =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const { data: accounts } = await supabase.from('social_accounts').select('id').eq('status', 'active');
  let newMessages = 0;
  for (const a of accounts ?? []) {
    newMessages += await syncInboxForAccount(supabase, a.id);
  }
  return Response.json({ newMessages });
}
