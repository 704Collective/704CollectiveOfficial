import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: evs } = await sb.from('events').select('id,title,start_time,discussion_opened_at').order('start_time');
for (const e of evs ?? []) {
  const opens = new Date(e.start_time).getTime() - 120 * 60 * 60 * 1000;
  const openNow = Boolean(e.discussion_opened_at) || Date.now() >= opens;
  console.log(`${e.id} | ${e.start_time?.slice(0, 10)} | open=${openNow} | ${e.title}`);
}
