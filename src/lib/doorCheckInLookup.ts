import { supabase } from '@/integrations/supabase/client';
import { resolvePersonId } from '@/lib/identity/resolvePerson';
import {
  overrideReasonOk,
  type CheckInPatch,
  type DoorCredential,
  type DoorEvent,
  type DoorProfile,
} from '@/lib/doorCheckIn';

export async function loadDoorEvent(eventId: string): Promise<DoorEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, required_tier, status')
    .eq('id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, required_tier: data.required_tier, status: data.status };
}

export async function loadProfileById(profileId: string): Promise<DoorProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('member_type, subscription_status, subscription_ends_at, membership_override')
    .eq('id', profileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function loadProfilesByPerson(personIds: string[]): Promise<Record<string, DoorProfile>> {
  const out: Record<string, DoorProfile> = {};
  if (personIds.length === 0) return out;
  const { data: people } = await supabase
    .from('people')
    .select('id, auth_user_id, metadata')
    .in('id', personIds);
  const profileIdByPerson: Record<string, string> = {};
  for (const person of people || []) {
    const meta = person.metadata as { profile_id?: string } | null;
    const profileId = person.auth_user_id || meta?.profile_id || null;
    if (profileId) profileIdByPerson[person.id] = profileId;
  }
  const profileIds = [...new Set(Object.values(profileIdByPerson))];
  if (profileIds.length === 0) return out;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, member_type, subscription_status, subscription_ends_at, membership_override')
    .in('id', profileIds)
    .is('deleted_at', null);
  const byId: Record<string, DoorProfile> = {};
  for (const profile of profiles || []) byId[profile.id] = profile;
  for (const [personId, profileId] of Object.entries(profileIdByPerson)) {
    out[personId] = byId[profileId] ?? null;
  }
  return out;
}

export async function loadProfileForPerson(personId: string): Promise<DoorProfile> {
  const map = await loadProfilesByPerson([personId]);
  return map[personId] ?? null;
}

export async function loadPersonCredentials(personId: string): Promise<DoorCredential[]> {
  const { data, error } = await supabase
    .from('attendance_credentials')
    .select('id, person_id, event_id, credential_type, status, checked_in_at')
    .eq('person_id', personId);
  if (error || !data) return [];
  return data;
}

export async function loadPersonName(personId: string): Promise<string> {
  const { data } = await supabase
    .from('people')
    .select('full_name')
    .eq('id', personId)
    .maybeSingle();
  return data?.full_name || 'Member';
}

/** Writes a check-in once. A row that already has checked_in_at is left alone. */
export async function applyDoorCheckIn(
  credentialId: string,
  adminAuthId: string,
  patch: CheckInPatch,
): Promise<string | null> {
  if (patch.checkin_failed_checks?.length && !overrideReasonOk(patch.checkin_override_reason)) {
    return 'A reason is required';
  }
  const { data, error } = await supabase
    .from('attendance_credentials')
    .update(patch)
    .eq('id', credentialId)
    .is('checked_in_at', null)
    .select('id');
  if (error) return error.message;
  if (!data || data.length === 0) return 'Already checked in';

  try {
    const { personId } = await resolvePersonId(adminAuthId);
    if (personId) {
      await supabase
        .from('attendance_credentials')
        .update({ checked_in_by: personId })
        .eq('id', credentialId);
    }
  } catch {
    // The check-in is already recorded.
  }
  return null;
}
