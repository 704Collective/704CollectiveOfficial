export interface BillingDiscount {
  couponName: string;
  couponCode: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  durationInMonths: number | null;
}

export interface MemberBillingProfile {
  id: string;
  email: string;
  full_name: string | null;
  member_type: string | null;
  subscription_status: string | null;
  membership_override: boolean;
  is_founding_member: boolean;
  is_locked_in_pricing: boolean;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_ends_at: string | null;
  cancel_at_period_end: boolean;
  member_since: string | null;
  canceled_at: string | null;
  comp_reason: string | null;
  external_paid_through: string | null;
  external_payment_note: string | null;
}

export interface MemberBillingStripe {
  found: boolean;
  subscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  priceId: string | null;
  priceCents: number | null;
  priceDisplay: string | null;
  interval: string | null;
  productName: string | null;
  discount: BillingDiscount | null;
}

export interface MemberBillingResponse {
  ok: boolean;
  error?: string;
  profile?: MemberBillingProfile;
  stripe?: MemberBillingStripe | null;
}
