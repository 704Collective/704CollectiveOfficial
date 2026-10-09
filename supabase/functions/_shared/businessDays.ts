// Wave H6 — Deno copy of src/lib/network/businessDays.ts. Same algorithm; keep in lockstep.
export const PLEDGE_BUSINESS_DAYS = 2;
export const PLEDGE_TZ = "America/New_York";

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: PLEDGE_TZ, weekday: "short" });
const weekday = (d: Date) => DOW[fmt.format(d)] ?? d.getUTCDay();

export function addBusinessDays(from: Date, days: number): Date {
  let d = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    d = new Date(d.getTime() + 86_400_000);
    const w = weekday(d);
    if (w !== 0 && w !== 6) added++;
  }
  return d;
}

export function pledgeDeadline(createdAt: Date | string): Date {
  return addBusinessDays(new Date(createdAt), PLEDGE_BUSINESS_DAYS);
}

export function isPastPledge(createdAt: Date | string, firstRepliedAt: string | null | undefined, now = new Date()): boolean {
  if (firstRepliedAt) return false;
  return now.getTime() > pledgeDeadline(createdAt).getTime();
}
