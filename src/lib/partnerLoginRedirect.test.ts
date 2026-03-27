import { describe, expect, it } from 'vitest';
import { partnerRedirectTarget } from './partnerLoginRedirect';

describe('partnerRedirectTarget', () => {
  it('defaults for empty or non-partner paths', () => {
    expect(partnerRedirectTarget(null)).toBe('/partners/dashboard');
    expect(partnerRedirectTarget('')).toBe('/partners/dashboard');
    expect(partnerRedirectTarget('/dashboard')).toBe('/partners/dashboard');
  });

  it('allows same-origin partner subpaths', () => {
    expect(partnerRedirectTarget('/partners/admin/partners')).toBe('/partners/admin/partners');
  });

  it('blocks protocol-relative and backslash tricks', () => {
    expect(partnerRedirectTarget('//evil.com')).toBe('/partners/dashboard');
    expect(partnerRedirectTarget('/partners\\evil')).toBe('/partners/dashboard');
  });
});
