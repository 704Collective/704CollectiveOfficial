import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Null when Upstash env vars are missing (local dev until configured). */
export const redis =
  url && token ? new Redis({ url, token }) : null;

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

/**
 * Sliding-window rate limiter (1 minute window). Prefix isolates keys per use-case.
 */
export function createRateLimiter(prefix: string, limit: number) {
  if (!redis) {
    return noopLimiter(limit);
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, '1 m'),
    prefix: `@upstash/ratelimit/${prefix}`,
  });
}
