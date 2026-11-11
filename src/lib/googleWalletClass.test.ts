import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOOGLE_WALLET_JWT_ORIGINS,
  googleWalletClassId,
  googleWalletClassSuffix,
  googleWalletJwtOrigins,
  googleWalletObjectId,
} from '../../supabase/functions/_shared/googleWalletClass';

const ISSUER = '3388000000000000000';
const PROFILE = 'a0000000-0000-4000-8000-000000000002';

describe('googleWalletClass mapping', () => {
  it('uses 704collective_business for business members', () => {
    expect(googleWalletClassSuffix('business')).toBe('704collective_business');
    expect(googleWalletClassId(ISSUER, 'business')).toBe(`${ISSUER}.704collective_business`);
  });

  it('uses 704collective_social for social members', () => {
    expect(googleWalletClassSuffix('social')).toBe('704collective_social');
    expect(googleWalletClassId(ISSUER, 'social')).toBe(`${ISSUER}.704collective_social`);
  });

  it('falls back to social for null, undefined, and other tiers', () => {
    expect(googleWalletClassSuffix(null)).toBe('704collective_social');
    expect(googleWalletClassSuffix(undefined)).toBe('704collective_social');
    expect(googleWalletClassSuffix('lead')).toBe('704collective_social');
    expect(googleWalletClassId(ISSUER, null)).toBe(`${ISSUER}.704collective_social`);
  });

  it('builds object ids with dashes replaced by underscores', () => {
    expect(googleWalletObjectId(ISSUER, PROFILE)).toBe(
      `${ISSUER}.member_a0000000_0000_4000_8000_000000000002`,
    );
  });

  it('defaults JWT origins to apex, www, and local 3000/3001', () => {
    expect(googleWalletJwtOrigins(null)).toEqual([...DEFAULT_GOOGLE_WALLET_JWT_ORIGINS]);
    expect(googleWalletJwtOrigins('')).toEqual([...DEFAULT_GOOGLE_WALLET_JWT_ORIGINS]);
    expect(googleWalletJwtOrigins(' https://example.com , http://localhost:4000 ')).toEqual([
      'https://example.com',
      'http://localhost:4000',
    ]);
    expect(DEFAULT_GOOGLE_WALLET_JWT_ORIGINS).toContain('https://www.704collective.com');
    expect(DEFAULT_GOOGLE_WALLET_JWT_ORIGINS).toContain('http://localhost:3001');
  });
});
