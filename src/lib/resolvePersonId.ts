import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves a Supabase auth user id to the canonical people.id.
 *
 * The people table is the canonical record for every human in the system.
 * A person migrated from the profiles table carries the original auth user
 * id in metadata.profile_id. Since profiles.id IS the auth user id, the
 * chain is: authUserId === profiles.id === people.metadata->>'profile_id'.
 *
 * NOTE: .eq('metadata->>...') is INVALID PostgREST jsonb syntax. The jsonb
 * path filter must use .filter() with the 'eq' operator.
 *
 * Returns the people.id, or null if no matching person row exists.
 */
export async function resolvePersonId(authUserId: string): Promise<string | null> {
  if (!authUserId) return null;
  const { data, error } = await supabase
    .from('people')
    .select('id')
    .filter('metadata->>profile_id', 'eq', authUserId)
    .maybeSingle();
  if (error) {
    console.warn('[resolvePersonId] lookup failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}
