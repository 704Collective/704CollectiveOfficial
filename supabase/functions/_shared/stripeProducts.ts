// Stripe product identity — the ONE definition for the Deno runtime (Wave H2).
//
// THE ROUTING RULE: a subscription / invoice line whose product equals the
// listing product id (env STRIPE_LISTING_PRODUCT_ID) takes the listing path.
// In EVERY other case — unknown product, no product, env unset — behaviour is
// exactly what it was before this module existed. Default-to-current-behaviour.
//
// STRIPE_SOCIAL_PRODUCT_ID keeps the documented prod id as its fallback so the
// three former hard-coded copies (pricing.ts, cleanup-business-members,
// admin-financials) behave byte-for-byte when the env is unset. Note that
// stripe-webhook's checkout handler deliberately reads the raw env with NO
// fallback (unset = skip onboarding, fail-safe); that is unchanged.

import type Stripe from "https://esm.sh/stripe@18.5.0";

/** Documented prod Social product. Fallback only; env wins when set. */
export const SOCIAL_PRODUCT_ID_FALLBACK = "prod_TZI8im1xRNUMuy";

export const SOCIAL_PRODUCT_ID: string =
  (Deno.env.get("STRIPE_SOCIAL_PRODUCT_ID") ?? "").trim() || SOCIAL_PRODUCT_ID_FALLBACK;

/** Unset today. When unset, isListingProduct() is always false. */
export const LISTING_PRODUCT_ID: string | null =
  (Deno.env.get("STRIPE_LISTING_PRODUCT_ID") ?? "").trim() || null;

/** payments.payment_type for listing invoices. */
export const LISTING_PAYMENT_TYPE = "listing";

export function isListingProduct(productId: string | null | undefined): boolean {
  return !!LISTING_PRODUCT_ID && !!productId && productId === LISTING_PRODUCT_ID;
}

/** True for everything that is not the listing product — including unknowns and nulls. */
export function isMembershipContext(productId: string | null | undefined): boolean {
  return !isListingProduct(productId);
}

/** Product id off a subscription's first item (string or expanded object). */
export function subscriptionProductId(sub: Stripe.Subscription | null | undefined): string | null {
  const product = sub?.items?.data?.[0]?.price?.product as string | { id?: string } | null | undefined;
  if (!product) return null;
  return typeof product === "string" ? product : product.id ?? null;
}

export function isListingSubscription(sub: Stripe.Subscription | null | undefined): boolean {
  return isListingProduct(subscriptionProductId(sub));
}

/**
 * Product id off an invoice's first line. Handles both the legacy line shape
 * (line.price.product) and the Basil shape (line.pricing.price_details.product).
 */
export function invoiceProductId(invoice: Stripe.Invoice | null | undefined): string | null {
  const line = invoice?.lines?.data?.[0] as unknown as {
    price?: { product?: string | { id?: string } | null } | null;
    pricing?: { price_details?: { product?: string | null } | null } | null;
  } | undefined;
  if (!line) return null;
  const legacy = line.price?.product;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id ?? null;
  const basil = line.pricing?.price_details?.product;
  return basil ?? null;
}

/** Subscription id off an invoice (legacy invoice.subscription or Basil parent.subscription_details). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice | null | undefined): string | null {
  const inv = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
  } | undefined;
  const legacy = inv?.subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id ?? null;
  const basil = inv?.parent?.subscription_details?.subscription;
  if (basil) return typeof basil === "string" ? basil : basil.id ?? null;
  return null;
}
