import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { redis } from '@/lib/upstash';

function dayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin' && prof?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!redis) {
    return NextResponse.json({
      configured: false,
      cacheHitRate: null,
      totalCachedKeys: 0,
      rateLimitHitsToday: 0,
      topIps: [] as { ip: string; count: number }[],
      recentEvents: [] as { ip: string; route: string; timestamp: string }[],
      recentRateLimitEvents: [] as { ip: string; route: string; timestamp: string; count: number }[],
    });
  }

  const hit = Number((await redis.get('metrics:feed_cache:hit')) ?? 0);
  const miss = Number((await redis.get('metrics:feed_cache:miss')) ?? 0);
  const total = hit + miss;
  const cacheHitRate = total > 0 ? Math.round((hit / total) * 1000) / 10 : null;

  let totalCachedKeys = 0;
  try {
    const keys = await redis.keys('feed:*');
    totalCachedKeys = Array.isArray(keys) ? keys.length : 0;
  } catch {
    totalCachedKeys = 0;
  }

  const day = dayKey();
  const rateLimitHitsToday = Number((await redis.get(`metrics:rl:429:total:${day}`)) ?? 0);

  type Ev = { ip: string; route: string; timestamp: string };
  let recentEvents: Ev[] = [];
  const ipCount: Record<string, number> = {};
  try {
    const list = await redis.lrange('metrics:rl:events', 0, 199);
    const rows = Array.isArray(list) ? list : [];
    for (const item of rows) {
      try {
        const o = JSON.parse(String(item)) as { ip?: string; route?: string; ts?: string };
        const ip = o.ip ?? 'unknown';
        ipCount[ip] = (ipCount[ip] ?? 0) + 1;
        recentEvents.push({
          ip,
          route: o.route ?? '',
          timestamp: o.ts ?? '',
        });
      } catch {
        /* skip */
      }
    }
  } catch {
    recentEvents = [];
  }

  const topIps = Object.entries(ipCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  const aggMap = new Map<string, { ip: string; route: string; timestamp: string; count: number }>();
  for (const e of recentEvents) {
    const k = `${e.ip}\t${e.route}`;
    const prev = aggMap.get(k);
    if (!prev) {
      aggMap.set(k, { ip: e.ip, route: e.route, timestamp: e.timestamp, count: 1 });
    } else {
      prev.count += 1;
      if (e.timestamp > prev.timestamp) prev.timestamp = e.timestamp;
    }
  }
  const recentRateLimitEvents = [...aggMap.values()].sort((a, b) =>
    String(b.timestamp).localeCompare(String(a.timestamp))
  );

  return NextResponse.json({
    configured: true,
    cacheHitRate,
    totalCachedKeys,
    rateLimitHitsToday,
    topIps,
    recentEvents,
    recentRateLimitEvents,
  });
}
