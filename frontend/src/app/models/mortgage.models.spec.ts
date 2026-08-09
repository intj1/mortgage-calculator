import { describe, expect, it } from 'vitest';

import { DEFAULT_FORM, formToInput, monthLabel } from './mortgage.models';

describe('formToInput', () => {
  it('clamps down payment at the calculation boundary, not in form state', () => {
    // Mid-typing the price can be briefly tiny; the form keeps the user's
    // down payment, and only the engine input is clamped.
    const input = formToInput({ ...DEFAULT_FORM, homePrice: 4, downPayment: 75_000 });
    expect(input.down_payment).toBe(4);
    expect(input.home_price).toBe(4);
  });

  it('maps named terms and custom years', () => {
    expect(formToInput({ ...DEFAULT_FORM, termYears: 30 }).term).toBe('thirty_years');
    expect(formToInput({ ...DEFAULT_FORM, termYears: 20 }).term).toEqual({ custom: 240 });
  });
});

describe('monthLabel', () => {
  it('offsets across year boundaries', () => {
    expect(monthLabel('2026-09', 0)).toBe('Sep 2026');
    expect(monthLabel('2026-09', 4)).toBe('Jan 2027');
    expect(monthLabel('2026-09', 359)).toBe('Aug 2056');
  });

  it('returns null for invalid input', () => {
    expect(monthLabel('', 5)).toBeNull();
    expect(monthLabel('2026-13', 0)).toBeNull();
  });
});
