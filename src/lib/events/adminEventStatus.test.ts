import { describe, expect, it } from 'vitest';
import { adminEventStatusLabel } from './adminEventStatus';

const now = new Date('2026-10-17T18:00:00.000Z');
const future = '2026-10-20T18:00:00.000Z';
const past = '2026-10-01T18:00:00.000Z';

describe('adminEventStatusLabel', () => {
  it('shows Cancelled for a standard cancel even if the start time is still upcoming', () => {
    expect(adminEventStatusLabel({ status: 'cancelled', cancel_mode: 'standard', start_time: future }, now)).toEqual({
      text: 'Cancelled',
      kind: 'cancelled',
    });
  });

  it('shows Cancelled - 704 not hosting for not_hosting cancels', () => {
    expect(adminEventStatusLabel({ status: 'cancelled', cancel_mode: 'not_hosting', start_time: future }, now)).toEqual({
      text: 'Cancelled - 704 not hosting',
      kind: 'cancelled_not_hosting',
    });
  });

  it('shows Rescheduled instead of Upcoming', () => {
    expect(adminEventStatusLabel({ status: 'rescheduled', cancel_mode: 'standard', start_time: future }, now)).toEqual({
      text: 'Rescheduled',
      kind: 'rescheduled',
    });
  });

  it('keeps Upcoming / Past for scheduled events', () => {
    expect(adminEventStatusLabel({ status: 'scheduled', start_time: future }, now).text).toBe('Upcoming');
    expect(adminEventStatusLabel({ status: 'scheduled', start_time: past }, now).text).toBe('Past');
  });
});
