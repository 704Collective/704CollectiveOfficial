import { resolvePersonId as resolve } from '@/lib/identity/resolvePerson';

/**
 * Resolves a Supabase auth user id to the canonical people.id.
 *
 * Thin wrapper. The logic lives in @/lib/identity/resolvePerson, which is the
 * single frontend resolver; this file keeps the original name and the original
 * string | null return shape so existing callers are untouched.
 *
 * Returns the people.id, or null if no matching person row exists.
 */
export async function resolvePersonId(authUserId: string): Promise<string | null> {
  const { personId } = await resolve(authUserId);
  return personId;
}
