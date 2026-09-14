/**
 * Member visibility — the single definition of "who counts as a member" on
 * member-facing people surfaces (hub member tab/count, directory, @mention
 * picker, message recipient search, public business card).
 *
 * Approved 2026-09-14:
 *   visible  ⇔  subscription_status IN ('active','past_due')
 *            AND deleted_at IS NULL
 *            AND not banned            (both `banned` and `is_banned` columns)
 *            AND is_internal = false
 *
 * Everything else (canceled, inactive, paused, trialing, never-members,
 * soft-deleted, banned, internal/test accounts) is hidden.
 *
 * Three equivalent forms are exported so every surface uses one truth:
 *   - `MEMBER_VISIBILITY_FILTER` / `applyMemberVisibility()` for PostgREST
 *     queries (top-level or through an embedded `profiles` join),
 *   - `MEMBER_VISIBILITY_SQL` for RPC / SQL work,
 *   - `isVisibleMember()` for rows already loaded in memory.
 *
 * `is_banned` is nullable in the schema (default false), so a NULL there is
 * read as "not banned" rather than hiding the row. `banned` and `is_internal`
 * are NOT NULL.
 */

export const VISIBLE_SUBSCRIPTION_STATUSES = ['active', 'past_due'] as const;

/**
 * Only real member tiers may be *suggested* as people (mention picker). Leads,
 * prospects, `non_member`, `social_non_member`, partners etc. never surface.
 */
export const SUGGESTABLE_MEMBER_TYPES = ['social', 'business'] as const;

/**
 * PostgREST logic-tree fragment. Pass to `.or()` — PostgREST wraps it as
 * `or=(and(...))`, which is the approved predicate ANDed with every other
 * filter on the query. Column names are unprefixed so the same string works
 * for an embedded resource via `.or(filter, { referencedTable })`.
 */
export const MEMBER_VISIBILITY_FILTER =
  `and(subscription_status.in.(${VISIBLE_SUBSCRIPTION_STATUSES.join(',')}),` +
  'deleted_at.is.null,' +
  'banned.eq.false,' +
  'is_internal.eq.false,' +
  'or(is_banned.is.null,is_banned.eq.false))';

/**
 * Equivalent SQL condition for RPCs / migrations that need the same truth.
 * `p` is the alias of the `profiles` row. Keep in lockstep with the filter above.
 */
export const MEMBER_VISIBILITY_SQL =
  `p.subscription_status IN (${VISIBLE_SUBSCRIPTION_STATUSES.map((s) => `'${s}'`).join(', ')})` +
  ' AND p.deleted_at IS NULL' +
  ' AND p.banned = false' +
  ' AND COALESCE(p.is_banned, false) = false' +
  ' AND p.is_internal = false';

/** The profile columns the predicate reads. Select these when using `isVisibleMember`. */
export const MEMBER_VISIBILITY_COLUMNS = 'subscription_status, deleted_at, banned, is_banned, is_internal';

export interface MemberVisibilityFields {
  subscription_status: string | null;
  deleted_at: string | null;
  banned?: boolean | null;
  is_banned?: boolean | null;
  is_internal?: boolean | null;
}

/** In-memory form of the approved definition (for rows already fetched, e.g. RPC results). */
export function isVisibleMember(p: MemberVisibilityFields | null | undefined): boolean {
  if (!p) return false;
  if (!(VISIBLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(p.subscription_status ?? '')) return false;
  if (p.deleted_at) return false;
  if (p.banned === true) return false;
  if (p.is_banned === true) return false;
  if (p.is_internal !== false) return false;
  return true;
}

/** Minimal structural type so the helper accepts any PostgREST filter builder without generics. */
interface OrFilterable<T> {
  or(filters: string, options?: { referencedTable?: string }): T;
}

/**
 * Apply the approved predicate to a PostgREST query.
 *
 * @param query          A `supabase.from(...).select(...)` builder.
 * @param referencedTable When the profile is an embedded resource (e.g.
 *                        `profile:profiles!fk!inner(...)`), pass its alias so the
 *                        filter targets the join. Combine with `!inner` so parent
 *                        rows are pruned instead of returned with a null profile.
 */
export function applyMemberVisibility<T extends OrFilterable<T>>(query: T, referencedTable?: string): T {
  return referencedTable
    ? query.or(MEMBER_VISIBILITY_FILTER, { referencedTable })
    : query.or(MEMBER_VISIBILITY_FILTER);
}
