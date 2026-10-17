import { describe, expect, it } from 'vitest';
import {
  OAUTH_NO_ACCOUNT_MESSAGE,
  isOauthNoAccountDescription,
  oauthErrorLoginPath,
} from './oauthNoAccount';

describe('oauth no-account (Google new-account block)', () => {
  it('detects the hook message', () => {
    expect(isOauthNoAccountDescription(OAUTH_NO_ACCOUNT_MESSAGE)).toBe(true);
    expect(isOauthNoAccountDescription('random oauth error')).toBe(false);
  });

  it('sends ambassador Google refusals to /ambassadors/login, everyone else to /login', () => {
    expect(oauthErrorLoginPath('ambassadors')).toBe('/ambassadors/login');
    expect(oauthErrorLoginPath('login')).toBe('/login');
    expect(oauthErrorLoginPath(null)).toBe('/login');
  });
});
