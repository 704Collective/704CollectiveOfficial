import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

type LimitResult = { success: boolean };

const noopLimiter = (limit: number) => ({
  async limit(_identifier: string): Promise<LimitResult & { limit: number; remaining: number; reset: number }> {
    return {
      success: true,
      limit,
      remaining: limit,
      reset: Date.now(),
    };
  },
});

function looksLikePlaceholderUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes('placeholder')) return true;
  if (u.includes('your-upstash') || u.includes('your_upstash')) return true;
  if (u.includes('example.com') && u.includes('upstash')) return true;
  if (/\bchangeme\b|\breplace(_me)?\b|\bxxx+\b/.test(u)) return true;
  return false;
}

function looksLikePlaceholderToken(token: string): boolean {
  const t = token.toLowerCase().trim();
  if (!t) return true;
  if (t.includes('placeholder')) return true;
  if (t.includes('your_token') || t === 'changeme' || t === 'replace_me') return true;
  if (/^x+$/i.test(t) || /^\.+$/.test(t)) return true;
  return false;
}

let redisSingleton: Redis | null | undefined;

/**
 * Lazily creates the Upstash Redis REST client. Returns null when env vars are
 * missing, invalid, or look like Vercel/build placeholders — never throws at import or init.
 */
export function getRedisClient(): Redis | null {
  if (redisSingleton !== undefined) {
    return redisSingleton;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token || !url.startsWith('https://')) {
    redisSingleton = null;
    return null;
  }

  if (looksLikePlaceholderUrl(url) || looksLikePlaceholderToken(token)) {
    redisSingleton = null;
    return null;
  }

  try {
    redisSingleton = new Redis({ url, token });
    return redisSingleton;
  } catch {
    redisSingleton = null;
    return null;
  }
}

/**
 * Sliding-window rate limiter (1 minute window). Prefix isolates keys per use-case.
 * When Upstash is not configured, returns a no-op limiter that always allows.
 */
export function createRateLimiter(prefix: string, limit: number) {
  const redis = getRedisClient();
  if (!redis) {
    return noopLimiter(limit);
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, '1 m'),
    prefix: `@upstash/ratelimit/${prefix}`,
  });
}
