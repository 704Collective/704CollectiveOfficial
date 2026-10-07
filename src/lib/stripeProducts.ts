// Stripe product identity — the ONE definition for the Next.js runtime (Wave H2).
//
// THE ROUTING RULE: a subscription whose product equals the listing product id
// (env STRIPE_LISTING_PRODUCT_ID) is a listing, never a membership. In EVERY
// other case — unknown product, no product, env unset — behaviour is exactly
// what it was before this module existed.
//
// STRIPE_SOCIAL_PRODUCT_ID keeps the documented prod id as a fallback so the
// display in admin MembershipSettings is unchanged when the env is unset. This
// module is safe to import from client components: it reads only
// NEXT_PUBLIC_-prefixed or build-time-inlined envs and never a secret.

import type Stripe from 'stripe';

/** Documented prod Social product. Fallback only; env wins when set. */
export const SOCIAL_PRODUCT_ID_FALLBACK = 'prod_TZI8im1xRNUMuy';

export const SOCIAL_PRODUCT_ID: string =
  (process.env.STRIPE_SOCIAL_PRODUCT_ID ?? process.env.NEXT_PUBLIC_STRIPE_SOCIAL_PRODUCT_ID ?? '').trim() ||
  SOCIAL_PRODUCT_ID_FALLBACK;

/** Unset today. When unset, isListingProduct() is always false. */
export const LISTING_PRODUCT_ID: string | null =
  (process.env.STRIPE_LISTING_PRODUCT_ID ?? process.env.NEXT_PUBLIC_STRIPE_LISTING_PRODUCT_ID ?? '').trim() || null;

export function isListingProduct(productId: string | null | undefined): boolean {
  return !!LISTING_PRODUCT_ID && !!productId && productId === LISTING_PRODUCT_ID;
}

/** True for everything that is not the listing product — including unknowns and nulls. */
export function isMembershipContext(productId: string | null | undefined): boolean {
  return !isListingProduct(productId);
}

type SubLike = Pick<Stripe.Subscription, 'items'> | null | undefined;

/** Product id off a subscription's first item (string or expanded object). */
export function subscriptionProductId(sub: SubLike): string | null {
  const product = sub?.items?.data?.[0]?.price?.product as string | { id?: string } | null | undefined;
  if (!product) return null;
  return typeof product === 'string' ? product : (product.id ?? null);
}

export function isListingSubscription(sub: SubLike): boolean {
  return isListingProduct(subscriptionProductId(sub));
}

/**
 * Drop listing subscriptions from a list before any "which sub is the
 * membership" decision. With the env unset this returns the input unchanged.
 */
export function withoutListingSubs<T extends SubLike>(subs: T[]): T[] {
  if (!LISTING_PRODUCT_ID) return subs;
  return subs.filter((s) => !isListingSubscription(s));
}
