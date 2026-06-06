// Single source of truth for deriving the old-shaped event fields the UI
// reads (is_members_only, ticket_price, access_type, etc.) from the new
// canonical schema columns (required_tier, price_cents, member_price_cents).
//
// The events table no longer has the bare columns is_members_only,
// ticket_price, is_business_only, access_type, access_level,
// social_member_price, business_member_price. Only *_deprecated copies and
// the canonical columns exist. select('*') therefore returns the canonical
// columns but NOT the bare names, so any code reading event.is_members_only
// off a raw row gets undefined. Run every raw events row through this helper
// right after the query to restore those fields, derived from canonical.
//
// Logic mirrors the proven derivation in src/app/events/[id]/page.tsx.

export interface EventCanonicalFields {
  required_tier?: string | null;
  price_cents?: number | null;
  member_price_cents?: number | null;
}

export type DerivedAccessType = 'public_free' | 'public_ticketed' | 'members_only';
export type DerivedTicketMode = 'none' | 'public_only' | 'all';
export type DerivedAccessLevel = 'all' | 'business_only';

export interface DerivedEventShape {
  access_type: DerivedAccessType;
  ticket_mode: DerivedTicketMode;
  is_members_only: boolean;
  is_business_only: boolean;
  access_level: DerivedAccessLevel;
  ticket_price: number;
  social_member_price: number;
  business_member_price: number;
}

/**
 * Returns the input row plus the derived old-shaped fields.
 * Pure function. Never mutates the input.
 *
 * required_tier is the authority: any value other than 'public' is treated as
 * members-gated. An unknown/missing tier defaults to gated (fail safe: we would
 * rather over-gate than leak a members event as public).
 */
export function deriveEventShape<T extends EventCanonicalFields>(
  row: T,
): T & DerivedEventShape {
  const tier = row.required_tier ?? 'public';
  const isPublic = tier === 'public';
  const publicPriceCents = row.price_cents ?? 0;
  const memberPriceCents = row.member_price_cents ?? 0;

  let access_type: DerivedAccessType;
  if (!isPublic) {
    access_type = 'members_only';
  } else if (publicPriceCents > 0) {
    access_type = 'public_ticketed';
  } else {
    access_type = 'public_free';
  }

  let ticket_mode: DerivedTicketMode;
  if (access_type === 'public_ticketed') {
    ticket_mode = memberPriceCents > 0 ? 'all' : 'public_only';
  } else {
    ticket_mode = 'none';
  }

  const is_business_only = tier === 'business' || tier === 'founder';

  return {
    ...row,
    access_type,
    ticket_mode,
    is_members_only: !isPublic,
    is_business_only,
    access_level: is_business_only ? 'business_only' : 'all',
    ticket_price: publicPriceCents,
    social_member_price: memberPriceCents,
    business_member_price: memberPriceCents,
  };
}
