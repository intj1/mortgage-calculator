import { describe, expect, it } from 'vitest';

import { MortgageInput } from '../models/mortgage.models';
import { calculateLocally } from './local-engine';

function baseInput(overrides: Partial<MortgageInput> = {}): MortgageInput {
  return {
    home_price: 400_000,
    down_payment: 80_000,
    annual_rate: 0.06,
    term: 'thirty_years',
    points: 0,
    property_tax_annual: 0,
    home_insurance_annual: 0,
    hoa_monthly: 0,
    pmi_annual_rate: 0,
    extra_monthly_payment: 0,
    ...overrides,
  };
}

describe('local mortgage engine', () => {
  it('computes the standard monthly P&I payment', () => {
    const { summary } = calculateLocally(baseInput());
    // $320k at 6% for 30y => ~$1918.56/mo.
    expect(summary.monthly_principal_and_interest).toBeCloseTo(1918.56, 0);
  });

  it('amortizes to a zero balance over the full term', () => {
    const { schedule } = calculateLocally(baseInput());
    expect(schedule.length).toBe(360);
    expect(Math.abs(schedule[schedule.length - 1].ending_balance)).toBeLessThan(0.01);
  });

  it('extra payments shorten the term and save interest', () => {
    const { summary } = calculateLocally(baseInput({ extra_monthly_payment: 300 }));
    expect(summary.payoff_month).toBeLessThan(360);
    expect(summary.interest_saved).toBeGreaterThan(0);
    expect(summary.months_saved).toBeGreaterThan(0);
  });

  it('applies PMI and drops it once LTV falls to 80%', () => {
    const { schedule } = calculateLocally(
      baseInput({ down_payment: 40_000, pmi_annual_rate: 0.006 }),
    );
    expect(schedule[0].pmi).toBeGreaterThan(0);
    expect(schedule.some((p) => p.pmi === 0)).toBe(true);
  });

  it('buys the rate down with points', () => {
    const { summary } = calculateLocally(baseInput({ points: 2 }));
    expect(summary.effective_annual_rate).toBeCloseTo(0.055, 6);
    expect(summary.points_cost).toBeCloseTo(320_000 * 0.02, 4);
  });
});
