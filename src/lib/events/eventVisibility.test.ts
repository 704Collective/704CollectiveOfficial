import { describe, expect, it } from 'vitest';
import {
  discussionComposerOpen,
  isNotHostingLive,
  showCancelledPrefix,
  visibleUpcomingOrFilter,
} from './eventVisibility';

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe('eventVisibility — standard cancel is unchanged', () => {
  it('does not treat a standard cancel as list-visible', () => {
    expect(isNotHostingLive({ status: 'cancelled', cancel_mode: 'standard', end_time: future })).toBe(false);
    expect(isNotHostingLive({ status: 'cancelled', cancel_mode: null, end_time: future })).toBe(false);
    expect(isNotHostingLive({ status: 'scheduled', cancel_mode: 'not_hosting', end_time: future })).toBe(false);
  });

  it('does not prefix a standard cancel', () => {
    expect(showCancelledPrefix({ status: 'cancelled', cancel_mode: 'standard' })).toBe(false);
    expect(showCancelledPrefix({ status: 'scheduled', cancel_mode: 'not_hosting' })).toBe(false);
  });

  it('closes the discussion composer on a standard cancel (today\'s behavior)', () => {
    expect(discussionComposerOpen({ status: 'cancelled', cancel_mode: 'standard', end_time: future })).toBe(false);
    expect(discussionComposerOpen({ status: 'cancelled', cancel_mode: null, end_time: future })).toBe(false);
    expect(discussionComposerOpen({ status: 'scheduled', cancel_mode: 'standard', end_time: future })).toBe(true);
  });

  it('upcoming filter keeps scheduled and only live not_hosting cancels', () => {
    const now = '2026-10-17T12:00:00.000Z';
    expect(visibleUpcomingOrFilter(now)).toBe(
      'status.eq.scheduled,and(status.eq.cancelled,cancel_mode.eq.not_hosting,end_time.gt.2026-10-17T12:00:00.000Z)',
    );
  });
});

describe('eventVisibility — not_hosting', () => {
  it('is live only before end_time', () => {
    expect(isNotHostingLive({ status: 'cancelled', cancel_mode: 'not_hosting', end_time: future })).toBe(true);
    expect(isNotHostingLive({ status: 'cancelled', cancel_mode: 'not_hosting', end_time: past })).toBe(false);
  });

  it('prefixes CANCELLED while the mode is set', () => {
    expect(showCancelledPrefix({ status: 'cancelled', cancel_mode: 'not_hosting' })).toBe(true);
  });

  it('keeps the composer open only before end_time', () => {
    expect(discussionComposerOpen({ status: 'cancelled', cancel_mode: 'not_hosting', end_time: future })).toBe(true);
    expect(discussionComposerOpen({ status: 'cancelled', cancel_mode: 'not_hosting', end_time: past })).toBe(false);
  });
});
