import { describe, expect, it } from 'vitest';

import { calculateLocally } from './local-engine';
import { scheduleToCsv } from './csv';

const INPUT = {
  home_price: 300_000,
  down_payment: 60_000,
  annual_rate: 0.06,
  term: 'ten_years' as const,
  points: 0,
  property_tax_annual: 0,
  home_insurance_annual: 0,
  hoa_monthly: 0,
  pmi_annual_rate: 0,
  extra_monthly_payment: 0,
};

describe('scheduleToCsv', () => {
  it('renders a header plus one row per month', () => {
    const { schedule } = calculateLocally(INPUT);
    const csv = scheduleToCsv(schedule);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1 + 120);
    expect(lines[0]).toContain('month,date,total_payment,principal,interest');
    // Final balance column reads 0.00.
    const lastCols = lines[lines.length - 1].split(',');
    expect(lastCols[8]).toBe('0.00');
  });

  it('includes calendar dates when a start month is given', () => {
    const { schedule } = calculateLocally(INPUT);
    const lines = scheduleToCsv(schedule, '2026-09').trim().split('\n');
    expect(lines[1].split(',')[1]).toBe('Sep 2026');
    expect(lines[13].split(',')[1]).toBe('Sep 2027');
    // Without a start month the date column is empty.
    expect(scheduleToCsv(schedule).trim().split('\n')[1].split(',')[1]).toBe('');
  });
});
