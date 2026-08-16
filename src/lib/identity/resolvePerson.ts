import { supabase } from '@/integrations/supabase/client';

/**
 * THE ONE RESOLVER (frontend). Read-only by construction: the browser never
 * mints or heals, it only asks who it already is.
 *
 * Order, first hit wins:
 *   1. people.auth_user_id            - the real column (Wave 1)
 *   2. people.metadata->>profile_id   - the legacy sticky note, safety net
 *
 * No email fallback here on purpose. An email match is a claim, not proof of
 * identity, and the browser is not allowed to act on claims.
 *
 * Note on RLS: people_select_own_or_admin still authorizes rows by
 * metadata->>'profile_id' = auth.uid(). Step 1 therefore only returns a row
 * because trg_people_sync_auth_user_id keeps the column and the sticky note
 * equal. Repointing that policy at auth_user_id is Wave 3 work.
 *
 * NOTE: .eq('metadata->>...') is INVALID PostgREST jsonb syntax. The jsonb
 * path filter must use .filter() with the 'eq' operator.
 */
export type ResolvedVia = 'auth_column' | 'bridge' | null;

export interface ResolvedPerson {
  personId: string | null;
  via: ResolvedVia;
}

export async function resolvePersonId(authUserId: string): Promise<ResolvedPerson> {
  if (!authUserId) return { personId: null, via: null };

  const { data: byColumn, error: columnError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (columnError) {
    console.warn('[resolvePersonId] auth_column lookup failed:', columnError.message);
  }
  if (byColumn?.id) return { personId: byColumn.id, via: 'auth_column' };

  const { data: byBridge, error: bridgeError } = await supabase
    .from('people')
    .select('id')
    .filter('metadata->>profile_id', 'eq', authUserId)
    .maybeSingle();
  if (bridgeError) {
    console.warn('[resolvePersonId] bridge lookup failed:', bridgeError.message);
    return { personId: null, via: null };
  }
  if (byBridge?.id) return { personId: byBridge.id, via: 'bridge' };

  return { personId: null, via: null };
}
