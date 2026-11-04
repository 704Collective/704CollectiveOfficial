import { describe, expect, it } from 'vitest';
import { formatDue, formatShortDate, hasDueTime } from './dates';

describe('hasDueTime', () => {
  it('treats empty and midnight as unset', () => {
    expect(hasDueTime(null)).toBe(false);
    expect(hasDueTime('')).toBe(false);
    expect(hasDueTime('00:00:00')).toBe(false);
    expect(hasDueTime('00:00')).toBe(false);
  });

  it('keeps a real clock time', () => {
    expect(hasDueTime('09:30:00')).toBe(true);
    expect(hasDueTime('12:00:00')).toBe(true);
  });
});

describe('formatDue', () => {
  it('hides midnight so a date-only due reads as the date', () => {
    expect(formatDue('2026-11-03', '00:00:00')).toBe('Nov 3');
    expect(formatDue('2026-11-03', null)).toBe('Nov 3');
  });

  it('shows a real time when due_time is set', () => {
    expect(formatDue('2026-11-03', '14:30:00')).toBe('Nov 3 2:30 PM');
  });
});

describe('formatShortDate', () => {
  it('formats an ISO date as month and day', () => {
    expect(formatShortDate('2026-11-03')).toBe('Nov 3');
  });
});
