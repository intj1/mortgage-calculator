/**
 * TypeScript mirrors of the Rust API types (`src/loan/mod.rs`).
 * Field names match the JSON produced by the backend exactly.
 */

export type Term =
  | 'thirty_years'
  | 'fifteen_years'
  | 'ten_years'
  | { custom: number };

export interface MortgageInput {
  home_price: number;
  down_payment: number;
  /** Annual rate as a fraction, e.g. 0.0675 for 6.75%. */
  annual_rate: number;
  term: Term;
  points: number;
  property_tax_annual: number;
  home_insurance_annual: number;
  hoa_monthly: number;
  /** Annual PMI rate as a fraction of the balance, e.g. 0.006. */
  pmi_annual_rate: number;
  extra_monthly_payment: number;
}

export interface Payment {
  month: number;
  starting_balance: number;
  principal_and_interest: number;
  interest: number;
  principal: number;
  extra_principal: number;
  pmi: number;
  escrow: number;
  total_payment: number;
  ending_balance: number;
  cumulative_interest: number;
  cumulative_principal: number;
}

export interface MortgageSummary {
  loan_amount: number;
  origination_ltv: number;
  effective_annual_rate: number;
  points_cost: number;
  monthly_principal_and_interest: number;
  monthly_escrow: number;
  first_month_pmi: number;
  first_month_total_payment: number;
  total_interest: number;
  total_pmi: number;
  total_escrow: number;
  total_of_payments: number;
  payoff_month: number;
  months_saved: number;
  interest_saved: number;
}

export interface MortgageResult {
  input: MortgageInput;
  summary: MortgageSummary;
  schedule: Payment[];
}

/** Number of monthly payments in a term. */
export function termMonths(term: Term): number {
  if (term === 'thirty_years') return 360;
  if (term === 'fifteen_years') return 180;
  if (term === 'ten_years') return 120;
  return term.custom;
}

/**
 * The classic amortization formula: fixed monthly principal-and-interest
 * payment for a loan of `amount` at annual rate `annualRate` over `months`.
 */
export function monthlyPI(amount: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) return amount / months;
  const compound = Math.pow(1 + monthlyRate, months);
  return (amount * (monthlyRate * compound)) / (compound - 1);
}

/** Convenience: a friendly form model the UI binds to (rates in percent). */
export interface FormModel {
  homePrice: number;
  downPayment: number;
  ratePercent: number;
  termYears: number;
  points: number;
  propertyTaxAnnual: number;
  homeInsuranceAnnual: number;
  hoaMonthly: number;
  pmiRatePercent: number;
  extraMonthlyPayment: number;
  /** First payment month as 'YYYY-MM' (display only — not sent to the engine). */
  startMonth: string;
}

export const DEFAULT_FORM: FormModel = {
  homePrice: 747_500,
  downPayment: 75_000,
  ratePercent: 6.75,
  termYears: 30,
  points: 0,
  propertyTaxAnnual: 8_400,
  homeInsuranceAnnual: 2_100,
  hoaMonthly: 0,
  pmiRatePercent: 0.5,
  extraMonthlyPayment: 0,
  startMonth: new Date().toISOString().slice(0, 7),
};

const START_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Human label ("Mar 2049") for the calendar month `offset` months after
 * `startMonth`, or null when startMonth is not a valid 'YYYY-MM'.
 * Payment month 1 corresponds to offset 0.
 */
export function monthLabel(startMonth: string, offset: number): string | null {
  const m = START_MONTH_RE.exec(startMonth);
  if (!m) return null;
  const total = Number(startMonth.slice(0, 4)) * 12 + (Number(startMonth.slice(5, 7)) - 1) + offset;
  return `${MONTH_NAMES[((total % 12) + 12) % 12]} ${Math.floor(total / 12)}`;
}

/**
 * Coerce an untrusted partial (URL params, localStorage) into a valid
 * FormModel: numbers only, non-negative, down payment capped at home price.
 */
export function sanitizeForm(raw: Partial<Record<keyof FormModel, unknown>>): FormModel {
  const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const form: FormModel = {
    homePrice: num(raw.homePrice, DEFAULT_FORM.homePrice),
    downPayment: num(raw.downPayment, DEFAULT_FORM.downPayment),
    ratePercent: num(raw.ratePercent, DEFAULT_FORM.ratePercent),
    termYears: num(raw.termYears, DEFAULT_FORM.termYears),
    points: num(raw.points, DEFAULT_FORM.points),
    propertyTaxAnnual: num(raw.propertyTaxAnnual, DEFAULT_FORM.propertyTaxAnnual),
    homeInsuranceAnnual: num(raw.homeInsuranceAnnual, DEFAULT_FORM.homeInsuranceAnnual),
    hoaMonthly: num(raw.hoaMonthly, DEFAULT_FORM.hoaMonthly),
    pmiRatePercent: num(raw.pmiRatePercent, DEFAULT_FORM.pmiRatePercent),
    extraMonthlyPayment: num(raw.extraMonthlyPayment, DEFAULT_FORM.extraMonthlyPayment),
    startMonth:
      typeof raw.startMonth === 'string' && START_MONTH_RE.test(raw.startMonth)
        ? raw.startMonth
        : DEFAULT_FORM.startMonth,
  };
  form.downPayment = Math.min(form.downPayment, form.homePrice);
  return form;
}

export function formToInput(f: FormModel): MortgageInput {
  const term: Term =
    f.termYears === 30
      ? 'thirty_years'
      : f.termYears === 15
        ? 'fifteen_years'
        : f.termYears === 10
          ? 'ten_years'
          : { custom: Math.round(f.termYears * 12) };

  return {
    home_price: f.homePrice,
    down_payment: f.downPayment,
    annual_rate: f.ratePercent / 100,
    term,
    points: f.points,
    property_tax_annual: f.propertyTaxAnnual,
    home_insurance_annual: f.homeInsuranceAnnual,
    hoa_monthly: f.hoaMonthly,
    pmi_annual_rate: f.pmiRatePercent / 100,
    extra_monthly_payment: f.extraMonthlyPayment,
  };
}
