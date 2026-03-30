import { createClient } from '@supabase/supabase-js';
import { syncAllAccountMetrics } from '@/lib/social/analytics';

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
  const { data: workspaces } = await supabase.from('workspaces').select('id');
  let accountsSynced = 0;
  for (const w of workspaces ?? []) {
    accountsSynced += await syncAllAccountMetrics(supabase, w.id);
  }
  return Response.json({ accountsSynced });
}
