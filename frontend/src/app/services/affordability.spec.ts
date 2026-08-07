import { describe, expect, it } from 'vitest';

import { DEFAULT_FORM, formToInput, sanitizeForm } from '../models/mortgage.models';
import { calculateLocally } from './local-engine';
import { maxAffordablePrice } from './affordability';

const BASE = {
  ...DEFAULT_FORM,
  homePrice: 400_000,
  downPayment: 50_000,
  ratePercent: 6,
  propertyTaxAnnual: 6_000,
  homeInsuranceAnnual: 1_800,
  pmiRatePercent: 0.5,
  extraMonthlyPayment: 0,
};

describe('maxAffordablePrice', () => {
  it('finds a price whose payment is at, but not over, the target', () => {
    const target = 3_000;
    const price = maxAffordablePrice(target, BASE)!;
    expect(price).not.toBeNull();

    const paymentAt = (p: number) =>
      calculateLocally(
        formToInput(sanitizeForm({ ...BASE, homePrice: p })),
      ).summary.first_month_total_payment;

    expect(paymentAt(price)).toBeLessThanOrEqual(target);
    // $5k more house should blow the budget — the answer is tight.
    expect(paymentAt(price + 5_000)).toBeGreaterThan(target);
  });

  it('returns null when the budget cannot buy the minimum price', () => {
    expect(maxAffordablePrice(200, BASE)).toBeNull();
    expect(maxAffordablePrice(0, BASE)).toBeNull();
    expect(maxAffordablePrice(NaN, BASE)).toBeNull();
  });

  it('scales with the budget', () => {
    const small = maxAffordablePrice(2_500, BASE)!;
    const large = maxAffordablePrice(5_000, BASE)!;
    expect(large).toBeGreaterThan(small);
  });
});
