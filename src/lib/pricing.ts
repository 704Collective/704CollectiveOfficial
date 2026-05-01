// Pricing constants — single source of truth for all membership pricing.
// Price IDs are referenced via env vars at runtime (server-side only).
// UI uses display strings from this file.

export const SOCIAL_TIER = {
  monthlyCents: 4900,
  monthlyPrice: '$49',
  monthlyPriceFull: '$49/month',
  monthlyPriceShort: '$49/mo',
  legalAmount: '$49.00 per month',
  ctaLabel: 'Join Now - $49/mo',
  ctaLabelLong: 'Become a Member - $49/mo',
  productName: '704 Social Membership',
  productId: 'prod_TZI8im1xRNUMuy',
} as const;

export const BUSINESS_TIER = {
  monthlyCents: 30000,
  monthlyPrice: '$300',
  monthlyPriceFull: '$300/month',
  annualCents: 360000,
  annualPrice: '$3,600',
  annualPriceFull: '$3,600/year',
  productName: '704 Business Membership',
} as const;
