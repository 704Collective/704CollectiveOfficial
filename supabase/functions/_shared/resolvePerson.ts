// THE ONE RESOLVER (backend, service-role).
//
// Every backend path that needs a people.id goes through here instead of
// hand-rolling its own lookup. Resolution order, first hit wins:
//   1. people.auth_user_id       - the real column (Wave 1)
//   2. people.metadata->>profile_id - the legacy sticky note, safety net only
//   3. people.email_lower        - pre-bridge rows, healed on the spot
//
// A missing people row is a fixable state, not an error: with mint:true this
// returns a usable personId in every case where an email is in hand.
//
// Invariants this file must never break:
//   - email_lower is GENERATED ALWAYS. Never write it.
//   - roles is text[] NOT NULL. Merge, never clobber.
//   - trg_people_sync_auth_user_id mirrors auth_user_id and metadata.profile_id
//     in both directions, so writing either one is enough. We write the column.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type ResolveVia =
  | "auth_column"
  | "bridge"
  | "email"
  | "minted"
  | "healed"
  | null;

export interface ResolveProfile {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  member_type?: string | null;
  subscription_status?: string | null;
  membership_override?: boolean | null;
}

export interface ResolveOpts {
  authUserId?: string;
  email?: string;
  profile?: ResolveProfile;
  nameHint?: string;
  phoneHint?: string;
  source: string;
  mint: boolean;
}

export interface ResolveResult {
  personId: string | null;
  via: ResolveVia;
  healed: boolean;
}

// The column set every lookup returns, so heal decisions never need a second read.
const PERSON_COLUMNS = "id, auth_user_id, roles, member_tier, member_status, metadata";

interface PersonRow {
  id: string;
  auth_user_id: string | null;
  roles: string[] | null;
  member_tier: string | null;
  member_status: string | null;
  metadata: Record<string, unknown> | null;
}

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[RESOLVE-PERSON] ${step}${d}`);
};

function profileIsActive(profile?: ResolveProfile): boolean {
  if (!profile) return false;
  return (
    profile.subscription_status === "active" ||
    profile.subscription_status === "trialing" ||
    profile.membership_override === true
  );
}

function tierFor(profile?: ResolveProfile): string {
  return profile?.member_type === "business" ? "business" : "social";
}

function withMemberRole(existing: string[] | null | undefined): string[] {
  const roles = Array.isArray(existing) ? existing.slice() : [];
  if (!roles.includes("member")) roles.push("member");
  return roles;
}

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

async function locate(
  admin: SupabaseClient,
  authUserId: string | undefined,
  emailLower: string,
): Promise<{ row: PersonRow; via: Exclude<ResolveVia, "minted" | "healed" | null> } | null> {
  if (authUserId) {
    const { data, error } = await admin
      .from("people")
      .select(PERSON_COLUMNS)
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) log("auth_column lookup failed", { error: error.message });
    if (data) return { row: data as PersonRow, via: "auth_column" };

    // Safety net. The mirror trigger should make this branch unreachable; if it
    // fires, something wrote metadata.profile_id in a way that bypassed the trigger.
    const { data: bridged, error: bridgeError } = await admin
      .from("people")
      .select(PERSON_COLUMNS)
      .filter("metadata->>profile_id", "eq", authUserId)
      .maybeSingle();
    if (bridgeError) log("bridge lookup failed", { error: bridgeError.message });
    if (bridged) {
      log("LOUD: resolved via metadata.profile_id with an empty auth_user_id column. The mirror trigger was bypassed on this row", {
        authUserId,
        personId: (bridged as PersonRow).id,
      });
      return { row: bridged as PersonRow, via: "bridge" };
    }
  }

  if (emailLower) {
    const { data, error } = await admin
      .from("people")
      .select(PERSON_COLUMNS)
      .eq("email_lower", emailLower)
      .maybeSingle();
    if (error) log("email lookup failed", { error: error.message });
    if (data) return { row: data as PersonRow, via: "email" };
  }

  return null;
}

// Found by email while holding an auth user id: adopt the row. Writing
// auth_user_id is Case B of the mirror trigger, so metadata.profile_id follows.
async function heal(
  admin: SupabaseClient,
  row: PersonRow,
  opts: ResolveOpts,
  emailLower: string,
): Promise<ResolveResult> {
  const authUserId = opts.authUserId!;
  const promote = profileIsActive(opts.profile);

  const patch: Record<string, unknown> = { auth_user_id: authUserId };
  if (promote) {
    patch.roles = withMemberRole(row.roles);
    patch.member_tier = tierFor(opts.profile);
    patch.member_status = "active";
  }

  const { error: updateError } = await admin
    .from("people")
    .update(patch)
    .eq("id", row.id);

  if (updateError) {
    // 23505 = people_auth_user_id_key. Another row already owns this auth user;
    // that row is the winner, not this one.
    if ((updateError as { code?: string }).code === "23505") {
      log("heal lost the unique-index race, re-resolving", { personId: row.id, authUserId });
      const again = await locate(admin, authUserId, emailLower);
      if (again) return { personId: again.row.id, via: again.via, healed: false };
    }
    log("heal update failed", { personId: row.id, error: updateError.message });
    return { personId: row.id, via: "email", healed: false };
  }

  // Never trust the absence of an error. Read the row back and check the values.
  const { data: after, error: readError } = await admin
    .from("people")
    .select(PERSON_COLUMNS)
    .eq("id", row.id)
    .maybeSingle();

  if (readError || !after) {
    log("heal read-back failed", { personId: row.id, error: readError?.message });
    return { personId: row.id, via: "email", healed: false };
  }

  const confirmed = after as PersonRow;
  const linked = confirmed.auth_user_id === authUserId;
  const promoted = !promote ||
    (Array.isArray(confirmed.roles) && confirmed.roles.includes("member") &&
      confirmed.member_status === "active" &&
      confirmed.member_tier === tierFor(opts.profile));

  if (!linked || !promoted) {
    log("LOUD: heal read-back does not match what was written", {
      personId: row.id,
      wanted_auth_user_id: authUserId,
      got_auth_user_id: confirmed.auth_user_id,
      wanted_promotion: promote,
      got_roles: confirmed.roles,
      got_member_status: confirmed.member_status,
      got_member_tier: confirmed.member_tier,
    });
    return { personId: row.id, via: "email", healed: false };
  }

  log("healed", {
    personId: row.id,
    authUserId,
    promoted: promote,
    source: opts.source,
    mirrored_profile_id: confirmed.metadata?.profile_id ?? null,
  });
  return { personId: row.id, via: "healed", healed: true };
}

async function mint(
  admin: SupabaseClient,
  opts: ResolveOpts,
  emailLower: string,
): Promise<ResolveResult> {
  if (!emailLower) {
    log("cannot mint without an email", { source: opts.source });
    return { personId: null, via: null, healed: false };
  }

  // A guest is never promoted here. Member fields require both an auth user id
  // and a profile that is actually paying.
  const asMember = Boolean(opts.authUserId) && profileIsActive(opts.profile);

  const insert: Record<string, unknown> = {
    // email_lower is GENERATED ALWAYS from email. Never write it.
    email: emailLower,
    full_name: opts.nameHint || opts.profile?.full_name || localPart(emailLower),
    phone: opts.phoneHint || opts.profile?.phone || null,
    roles: asMember ? ["member"] : ["guest"],
    ...(asMember
      ? { member_tier: tierFor(opts.profile), member_status: "active" }
      : {}),
    ...(opts.authUserId ? { auth_user_id: opts.authUserId } : {}),
    metadata: {
      source: opts.source,
      ...(opts.profile?.id ? { profile_id: opts.profile.id } : {}),
    },
  };

  const { data, error } = await admin
    .from("people")
    .insert(insert)
    .select("id")
    .single();

  if (!error && data) {
    log("minted", { personId: data.id, asMember, source: opts.source });
    return { personId: data.id, via: "minted", healed: false };
  }

  // 23505 = people_email_lower_unique or people_auth_user_id_key. A concurrent
  // caller minted first; re-resolve and return their row.
  if ((error as { code?: string } | null)?.code === "23505") {
    log("mint lost the unique-index race, re-resolving", { source: opts.source });
    const again = await locate(admin, opts.authUserId, emailLower);
    if (again) {
      if (again.via === "email" && opts.authUserId) {
        return await heal(admin, again.row, opts, emailLower);
      }
      return { personId: again.row.id, via: again.via, healed: false };
    }
  }

  log("mint failed", {
    source: opts.source,
    error: error?.message,
    code: (error as { code?: string } | null)?.code,
  });
  return { personId: null, via: null, healed: false };
}

export async function resolvePerson(
  admin: SupabaseClient,
  opts: ResolveOpts,
): Promise<ResolveResult> {
  const emailLower = (opts.email ?? opts.profile?.email ?? "").trim().toLowerCase();

  const found = await locate(admin, opts.authUserId, emailLower);
  if (found) {
    if (found.via === "email" && opts.authUserId) {
      return await heal(admin, found.row, opts, emailLower);
    }
    return { personId: found.row.id, via: found.via, healed: false };
  }

  if (!opts.mint) return { personId: null, via: null, healed: false };
  return await mint(admin, opts, emailLower);
}

// Read-only convenience for call sites that only need to know who the actor is:
// column first, sticky note second, no email fallback, no writes.
export async function resolveActorPersonId(
  admin: SupabaseClient,
  authUserId: string,
): Promise<string | null> {
  if (!authUserId) return null;
  const found = await locate(admin, authUserId, "");
  return found?.row.id ?? null;
}
