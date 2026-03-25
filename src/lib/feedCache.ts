import { redis } from '@/lib/upstash';

const TTL_SECONDS = 60;

function cacheKey(feedType: string, page: number): string {
  return `feed:${feedType}:page:${page}`;
}

/**
 * Returns cached feed page JSON (array of posts) or null if missing/invalid.
 */
export async function getCachedFeed(feedType: string, page: number): Promise<unknown[] | null> {
  if (!redis) return null;

  const raw = await redis.get<string>(cacheKey(feedType, page));
  if (raw == null) return null;

  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stores a feed page in Redis with a 60s TTL.
 */
export async function setCachedFeed(feedType: string, page: number, posts: unknown[]): Promise<void> {
  if (!redis) return;

  await redis.set(cacheKey(feedType, page), JSON.stringify(posts), { ex: TTL_SECONDS });
}
