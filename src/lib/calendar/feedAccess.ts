export type CalendarFeedDenyStatus = 403 | 410;

/**
 * Token matched a profile, but membership is not `active`.
 * Transient billing states stay 403 so an already-subscribed calendar retries.
 * Canceled / inactive / missing status return 410 so Apple stops hourly polls.
 */
export function calendarFeedInactiveStatus(
  subscriptionStatus: string | null | undefined,
): CalendarFeedDenyStatus {
  const s = (subscriptionStatus ?? '').toLowerCase();
  if (s === 'past_due' || s === 'paused' || s === 'trialing') return 403;
  return 410;
}
