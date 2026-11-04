import { describe, expect, it } from 'vitest';
import { tmTimeMachineVisible } from './timeMachine';

describe('tmTimeMachineVisible', () => {
  it('is hidden when the env is production even if the honor flag is on', () => {
    expect(tmTimeMachineVisible({ vercelEnv: 'production', honorFlag: true })).toBe(false);
  });

  it('is hidden on develop when the honor flag is off', () => {
    expect(tmTimeMachineVisible({ vercelEnv: 'preview', honorFlag: false })).toBe(false);
  });

  it('is visible on non-production when the honor flag is on', () => {
    expect(tmTimeMachineVisible({ vercelEnv: 'preview', honorFlag: true })).toBe(true);
    expect(tmTimeMachineVisible({ vercelEnv: 'development', honorFlag: true })).toBe(true);
  });
});
