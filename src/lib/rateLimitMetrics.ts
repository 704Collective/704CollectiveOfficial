import { getRedisClient } from '@/lib/upstash';
import { getRequestIp } from '@/lib/getRequestIp';
import type { NextRequest } from 'next/server';

const DAY_KEY = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** Increment when returning HTTP 429 from API routes (Upstash-backed). */
export async function recordRateLimit429(request: NextRequest, route: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const ip = getRequestIp(request);
  const day = DAY_KEY();
  const totalKey = `metrics:rl:429:total:${day}`;
  const payload = JSON.stringify({ ip, route, ts: new Date().toISOString() });
  try {
    await redis.incr(totalKey);
    await redis.expire(totalKey, 86400 * 3);
    await redis.lpush('metrics:rl:events', payload);
    await redis.ltrim('metrics:rl:events', 0, 199);
  } catch {
    /* non-fatal */
  }
}
