const TZ = 'America/New_York';

export function charlotteToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDue(dueDate: string | null, dueTime?: string | null): string {
  if (!dueDate) return 'No date';
  const [y, m, d] = dueDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = charlotteToday();
  const tomorrow = addDays(today, 1);
  if (dueDate === today) return dueTime ? `Today ${formatTime(dueTime)}` : 'Today';
  if (dueDate === tomorrow) return dueTime ? `Tomorrow ${formatTime(dueTime)}` : 'Tomorrow';
  const label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return dueTime ? `${label} ${formatTime(dueTime)}` : label;
}

export function formatTime(t: string): string {
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

export function isLaterDue(
  currentDate: string | null,
  currentTime: string | null,
  nextDate: string | null,
  nextTime: string | null
): boolean {
  if (!currentDate || !nextDate) return false;
  if (nextDate > currentDate) return true;
  if (nextDate === currentDate && nextTime && (!currentTime || nextTime > currentTime)) return true;
  return false;
}
