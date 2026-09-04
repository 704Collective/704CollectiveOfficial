import { SOCIAL_TIER } from '@/lib/pricing';

export type PromoDuration = 'once' | 'repeating' | 'forever';

export type PromoQuotePayload = {
  valid: boolean;
  percent_off?: number | null;
  amount_off?: number | null;
  duration?: PromoDuration | null;
  duration_in_months?: number | null;
};

export type PromoQuoteView = {
  displayPrice: string;
  durationLine: string;
  thenPriceLine: string | null;
};

/** Display-only. create-checkout still resolves the code at session time. */
export function promoDurationWording(
  duration: PromoDuration,
  durationInMonths: number | null,
  thenPrice: string = SOCIAL_TIER.monthlyPriceFull,
): { durationLine: string; thenPriceLine: string | null } {
  if (duration === 'forever') {
    return { durationLine: 'every month', thenPriceLine: null };
  }
  if (duration === 'repeating') {
    const n = durationInMonths ?? 0;
    return {
      durationLine: `for your first ${n} months`,
      thenPriceLine: `Then ${thenPrice}`,
    };
  }
  return {
    durationLine: 'for your first month',
    thenPriceLine: `Then ${thenPrice}`,
  };
}

export function discountedMonthlyCents(
  baseCents: number,
  percentOff: number | null,
  amountOff: number | null,
): number {
  if (percentOff != null && percentOff > 0) {
    return Math.round((baseCents * (100 - percentOff)) / 100);
  }
  if (amountOff != null && amountOff > 0) {
    return Math.max(0, baseCents - amountOff);
  }
  return baseCents;
}

export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function promoQuoteView(
  percentOff: number | null,
  amountOff: number | null,
  duration: PromoDuration,
  durationInMonths: number | null,
  baseCents: number = SOCIAL_TIER.monthlyCents,
): PromoQuoteView {
  const lines = promoDurationWording(duration, durationInMonths);
  return {
    displayPrice: formatUsdFromCents(discountedMonthlyCents(baseCents, percentOff, amountOff)),
    durationLine: lines.durationLine,
    thenPriceLine: lines.thenPriceLine,
  };
}
