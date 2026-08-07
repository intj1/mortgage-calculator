import { describe, expect, it } from 'vitest';

import { DEFAULT_FORM, FormModel, sanitizeForm } from '../models/mortgage.models';
import { decodeShareParams, encodeShareParams } from './share';

describe('share link codec', () => {
  it('round-trips a full form through the URL', () => {
    const form: FormModel = {
      homePrice: 500_000,
      downPayment: 100_000,
      ratePercent: 5.5,
      termYears: 15,
      points: 1.5,
      propertyTaxAnnual: 4_000,
      homeInsuranceAnnual: 1_200,
      hoaMonthly: 150,
      pmiRatePercent: 0.6,
      extraMonthlyPayment: 250,
      startMonth: '2027-03',
    };
    const decoded = decodeShareParams('?' + encodeShareParams(form));
    expect(decoded).toEqual(form);
  });

  it('rejects a malformed start month', () => {
    const decoded = decodeShareParams('?sd=not-a-month&r=7');
    expect(decoded!.startMonth).toBe(DEFAULT_FORM.startMonth);
  });

  it('omits default values to keep URLs short', () => {
    const query = encodeShareParams({ ...DEFAULT_FORM, ratePercent: 7 });
    expect(query).toBe('r=7');
  });

  it('returns null for a query with no loan params', () => {
    expect(decodeShareParams('')).toBeNull();
    expect(decodeShareParams('?utm_source=x')).toBeNull();
  });

  it('sanitizes hostile values back to defaults', () => {
    const decoded = decodeShareParams('?hp=abc&r=-5&dp=99999999');
    expect(decoded).not.toBeNull();
    expect(decoded!.homePrice).toBe(DEFAULT_FORM.homePrice);
    expect(decoded!.ratePercent).toBe(DEFAULT_FORM.ratePercent);
    // Down payment is capped at the home price.
    expect(decoded!.downPayment).toBeLessThanOrEqual(decoded!.homePrice);
  });
});

describe('sanitizeForm', () => {
  it('caps down payment at home price', () => {
    const form = sanitizeForm({ homePrice: 100_000, downPayment: 200_000 });
    expect(form.downPayment).toBe(100_000);
  });

  it('rejects negatives and non-numbers', () => {
    const form = sanitizeForm({ ratePercent: -1, hoaMonthly: 'xyz' });
    expect(form.ratePercent).toBe(DEFAULT_FORM.ratePercent);
    expect(form.hoaMonthly).toBe(DEFAULT_FORM.hoaMonthly);
  });
});
