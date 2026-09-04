import { describe, expect, it } from 'vitest';
import {
  discountedMonthlyCents,
  formatUsdFromCents,
  promoDurationWording,
  promoQuoteView,
} from './promoQuote';

describe('promoDurationWording', () => {
  it('once: duration line without price tail', () => {
    expect(promoDurationWording('once', null)).toEqual({
      durationLine: 'for your first month',
      thenPriceLine: 'Then $49/month',
    });
  });

  it('repeating 3 months: exact two-line pair', () => {
    expect(promoDurationWording('repeating', 3)).toEqual({
      durationLine: 'for your first 3 months',
      thenPriceLine: 'Then $49/month',
    });
  });

  it('forever: every month, no then-price line', () => {
    expect(promoDurationWording('forever', null)).toEqual({
      durationLine: 'every month',
      thenPriceLine: null,
    });
  });
});

describe('discounted monthly display', () => {
  it('formats a 50% once coupon as $24.50', () => {
    expect(discountedMonthlyCents(4900, 50, null)).toBe(2450);
    expect(formatUsdFromCents(2450)).toBe('$24.50');
    const view = promoQuoteView(50, null, 'once', null);
    expect(view.displayPrice).toBe('$24.50');
    expect(view.durationLine).toBe('for your first month');
    expect(view.thenPriceLine).toBe('Then $49/month');
  });
});
