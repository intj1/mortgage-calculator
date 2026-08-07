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
