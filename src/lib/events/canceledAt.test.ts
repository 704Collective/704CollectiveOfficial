import { describe, expect, it } from 'vitest';
import { shouldDisplayCanceledAt } from './canceledAt';

describe('shouldDisplayCanceledAt', () => {
  it('hides the stamp while the member is live', () => {
    expect(shouldDisplayCanceledAt('active', '2026-09-07T00:00:00Z')).toBe(false);
    expect(shouldDisplayCanceledAt('trialing', '2026-09-07T00:00:00Z')).toBe(false);
    expect(shouldDisplayCanceledAt('past_due', '2026-09-07T00:00:00Z')).toBe(false);
  });

  it('shows the stamp only when status is canceled and a date exists', () => {
    expect(shouldDisplayCanceledAt('canceled', '2026-09-07T00:00:00Z')).toBe(true);
    expect(shouldDisplayCanceledAt('cancelled', '2026-09-07T00:00:00Z')).toBe(true);
    expect(shouldDisplayCanceledAt('canceled', null)).toBe(false);
    expect(shouldDisplayCanceledAt('inactive', '2026-09-07T00:00:00Z')).toBe(false);
  });
});
