import { describe, expect, it } from 'vitest';

import { calculateLocally } from './local-engine';
import { scheduleToCsv } from './csv';

describe('scheduleToCsv', () => {
  it('renders a header plus one row per month', () => {
    const { schedule } = calculateLocally({
      home_price: 300_000,
      down_payment: 60_000,
      annual_rate: 0.06,
      term: 'ten_years',
      points: 0,
      property_tax_annual: 0,
      home_insurance_annual: 0,
      hoa_monthly: 0,
      pmi_annual_rate: 0,
      extra_monthly_payment: 0,
    });
    const csv = scheduleToCsv(schedule);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1 + 120);
    expect(lines[0]).toContain('month,total_payment,principal,interest');
    // Final balance column reads 0.00.
    const lastCols = lines[lines.length - 1].split(',');
    expect(lastCols[7]).toBe('0.00');
  });
});
