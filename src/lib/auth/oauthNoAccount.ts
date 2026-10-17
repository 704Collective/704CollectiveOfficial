export const OAUTH_NO_ACCOUNT_MESSAGE =
  'No 704 account uses this Google email. Sign in with the email you joined with, or join at 704collective.com/join.';

export function isOauthNoAccountDescription(description: string): boolean {
  return /No 704 account uses this Google email/i.test(description);
}

export function oauthErrorLoginPath(source: string | null): '/login' | '/ambassadors/login' {
  return source === 'ambassadors' ? '/ambassadors/login' : '/login';
}
