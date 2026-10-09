// Wave H6 — the reply pledge is "2 business days", counted in Charlotte time
// with weekends excluded. Keep in lockstep with
// supabase/functions/_shared/businessDays.ts (Deno copy, same algorithm).

export const PLEDGE_BUSINESS_DAYS = 2;
export const PLEDGE_TZ = 'America/New_York';

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function weekdayIn(d: Date, tz: string): number {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }); fmtCache.set(tz, f); }
  return DOW[f.format(d)] ?? d.getUTCDay();
}

/** `from` advanced by `days` weekdays (Sat/Sun skipped), same clock time. */
export function addBusinessDays(from: Date, days: number, tz = PLEDGE_TZ): Date {
  let d = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    d = new Date(d.getTime() + 86_400_000);
    const w = weekdayIn(d, tz);
    if (w !== 0 && w !== 6) added++;
  }
  return d;
}

/** When the reply pledge for a lead created at `createdAt` runs out. */
export function pledgeDeadline(createdAt: Date | string, tz = PLEDGE_TZ): Date {
  return addBusinessDays(new Date(createdAt), PLEDGE_BUSINESS_DAYS, tz);
}

/** True when a lead is unanswered and past its pledge deadline. */
export function isPastPledge(createdAt: Date | string, firstRepliedAt: string | null | undefined, now = new Date(), tz = PLEDGE_TZ): boolean {
  if (firstRepliedAt) return false;
  return now.getTime() > pledgeDeadline(createdAt, tz).getTime();
}

/** Business hours between two instants (weekend hours removed); used for the avg-reply laggard test. */
export function businessHoursBetween(start: Date | string, end: Date | string, tz = PLEDGE_TZ): number {
  const a = new Date(start).getTime(), b = new Date(end).getTime();
  if (b <= a) return 0;
  // Walk in whole-day steps from `a`, dropping any 24h slice that starts on a weekend day.
  let t = a, hours = 0;
  while (t < b) {
    const next = Math.min(t + 86_400_000, b);
    const w = weekdayIn(new Date(t), tz);
    if (w !== 0 && w !== 6) hours += (next - t) / 36e5;
    t = next;
  }
  return hours;
}
