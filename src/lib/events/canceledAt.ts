const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

/** True when a canceled_at stamp should be shown (not leftover after reactivation). */
export function shouldDisplayCanceledAt(
  subscriptionStatus: string | null | undefined,
  canceledAt: string | null | undefined,
): boolean {
  if (!canceledAt) return false;
  const s = (subscriptionStatus ?? '').toLowerCase();
  if (LIVE_STATUSES.has(s)) return false;
  return CANCELED_STATUSES.has(s);
}
