/**
 * Encode/decode a loan scenario as compact URL query params so users can
 * bookmark or share a link, plus localStorage persistence across visits.
 */

import { DEFAULT_FORM, FormModel, sanitizeForm } from '../models/mortgage.models';

/** Short, stable param names — these appear in shared URLs. */
const PARAM_KEYS: ReadonlyArray<[param: string, key: keyof FormModel]> = [
  ['hp', 'homePrice'],
  ['dp', 'downPayment'],
  ['r', 'ratePercent'],
  ['ty', 'termYears'],
  ['pts', 'points'],
  ['tax', 'propertyTaxAnnual'],
  ['ins', 'homeInsuranceAnnual'],
  ['hoa', 'hoaMonthly'],
  ['pmi', 'pmiRatePercent'],
  ['x', 'extraMonthlyPayment'],
];

const STORAGE_KEY = 'mc-form';

/** Serialize a form to a query string, omitting values equal to the default. */
export function encodeShareParams(form: FormModel): string {
  const params = new URLSearchParams();
  for (const [param, key] of PARAM_KEYS) {
    if (form[key] !== DEFAULT_FORM[key]) {
      params.set(param, String(form[key]));
    }
  }
  return params.toString();
}

/**
 * Parse a query string back into a form. Returns null when the query carries
 * no recognized loan params (so callers can fall through to other sources).
 */
export function decodeShareParams(query: string): FormModel | null {
  const params = new URLSearchParams(query);
  const raw: Partial<Record<keyof FormModel, unknown>> = {};
  let found = false;
  for (const [param, key] of PARAM_KEYS) {
    const value = params.get(param);
    if (value !== null) {
      raw[key] = value;
      found = true;
    }
  }
  return found ? sanitizeForm(raw) : null;
}

/** Persist the form for the next visit. Storage failures are ignored. */
export function saveForm(form: FormModel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  } catch {
    /* private mode etc. */
  }
}

/** Load the previously saved form, or null when absent/corrupt. */
export function loadSavedForm(): FormModel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeForm(JSON.parse(raw));
  } catch {
    return null;
  }
}
