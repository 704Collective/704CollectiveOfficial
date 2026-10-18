import { describe, expect, it } from 'vitest';
import { calendarFeedInactiveStatus } from './feedAccess';

describe('calendarFeedInactiveStatus', () => {
  it('keeps 403 for transient billing states', () => {
    expect(calendarFeedInactiveStatus('past_due')).toBe(403);
    expect(calendarFeedInactiveStatus('paused')).toBe(403);
    expect(calendarFeedInactiveStatus('trialing')).toBe(403);
  });

  it('returns 410 so canceled/inactive calendars stop polling', () => {
    expect(calendarFeedInactiveStatus('canceled')).toBe(410);
    expect(calendarFeedInactiveStatus('cancelled')).toBe(410);
    expect(calendarFeedInactiveStatus('inactive')).toBe(410);
    expect(calendarFeedInactiveStatus(null)).toBe(410);
    expect(calendarFeedInactiveStatus('')).toBe(410);
  });
});
