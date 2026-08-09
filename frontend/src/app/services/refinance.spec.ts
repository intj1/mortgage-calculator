import { describe, expect, it } from 'vitest';

import { calculateLocally } from './local-engine';
import { analyzeRefinance } from './refinance';

const CURRENT = calculateLocally({
  home_price: 400_000,
  down_payment: 40_000,
  annual_rate: 0.07,
  term: 'thirty_years',
  points: 0,
  property_tax_annual: 0,
  home_insurance_annual: 0,
  hoa_monthly: 0,
  pmi_annual_rate: 0,
  extra_monthly_payment: 0,
  lump_sum: 0,
  lump_sum_month: 0,
});

describe('analyzeRefinance', () => {
  it('a materially lower rate saves money and breaks even', () => {
    const a = analyzeRefinance(CURRENT, {
      monthsPaid: 24,
      newRatePercent: 5.5,
      newTermYears: 30,
      closingCosts: 6_000,
    })!;
    expect(a).not.toBeNull();
    expect(a.balanceAtRefi).toBeLessThan(360_000);
    expect(a.newPayment).toBeLessThan(a.oldPayment);
    expect(a.monthlySavings).toBeGreaterThan(0);
    expect(a.breakEvenMonths).toBeGreaterThan(0);
    expect(a.lifetimeSavings).toBeGreaterThan(0);
    // Break-even is closing costs / monthly savings, rounded up.
    expect(a.breakEvenMonths).toBe(Math.ceil(6_000 / a.monthlySavings));
  });

  it('a higher rate has no break-even', () => {
    const a = analyzeRefinance(CURRENT, {
      monthsPaid: 24,
      newRatePercent: 9,
      newTermYears: 30,
      closingCosts: 6_000,
    })!;
    expect(a.monthlySavings).toBeLessThan(0);
    expect(a.breakEvenMonths).toBeNull();
    expect(a.lifetimeSavings).toBeLessThan(0);
  });

  it('rejects impossible inputs', () => {
    expect(
      analyzeRefinance(CURRENT, { monthsPaid: 400, newRatePercent: 5, newTermYears: 30, closingCosts: 0 }),
    ).toBeNull();
    expect(
      analyzeRefinance(CURRENT, { monthsPaid: 24, newRatePercent: 5, newTermYears: 0, closingCosts: 0 }),
    ).toBeNull();
  });
});
