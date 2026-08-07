/**
 * Offline mirror of the Rust amortization engine (`src/loan/mod.rs`).
 *
 * The backend is the source of truth; this exists so the UI still works when
 * the API is unreachable (e.g. static hosting or a demo without the server).
 * Keep it in sync with the Rust implementation.
 */

import {
  MortgageInput,
  MortgageResult,
  MortgageSummary,
  Payment,
  monthlyPI,
  termMonths,
} from '../models/mortgage.models';

const RATE_REDUCTION_PER_POINT = 0.0025;
const COST_PER_POINT = 0.01;
const PMI_LTV_THRESHOLD = 0.8;

function loanAmount(input: MortgageInput): number {
  return input.home_price - input.down_payment;
}

function effectiveAnnualRate(input: MortgageInput): number {
  return Math.max(0, input.annual_rate - input.points * RATE_REDUCTION_PER_POINT);
}

function monthlyPrincipalAndInterest(input: MortgageInput): number {
  return monthlyPI(loanAmount(input), effectiveAnnualRate(input), termMonths(input.term));
}

function buildSchedule(input: MortgageInput): Payment[] {
  const n = termMonths(input.term);
  const monthlyRate = effectiveAnnualRate(input) / 12;
  const basePayment = monthlyPrincipalAndInterest(input);
  const escrow =
    input.property_tax_annual / 12 + input.home_insurance_annual / 12 + input.hoa_monthly;
  const monthlyPmiRate = input.pmi_annual_rate / 12;

  let balance = loanAmount(input);
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  const schedule: Payment[] = [];

  for (let month = 1; month <= n; month++) {
    if (balance <= 0) break;
    const startingBalance = balance;
    const interest = balance * monthlyRate;

    let principal = Math.max(0, basePayment - interest);
    let extra = input.extra_monthly_payment;
    if (principal + extra > balance) {
      if (principal > balance) {
        principal = balance;
        extra = 0;
      } else {
        extra = balance - principal;
      }
    }

    const pmi =
      startingBalance / input.home_price > PMI_LTV_THRESHOLD
        ? startingBalance * monthlyPmiRate
        : 0;

    balance -= principal + extra;
    if (balance < 0.005) balance = 0;
    cumulativeInterest += interest;
    cumulativePrincipal += principal + extra;

    schedule.push({
      month,
      starting_balance: startingBalance,
      principal_and_interest: interest + principal,
      interest,
      principal,
      extra_principal: extra,
      pmi,
      escrow,
      total_payment: interest + principal + extra + pmi + escrow,
      ending_balance: balance,
      cumulative_interest: cumulativeInterest,
      cumulative_principal: cumulativePrincipal,
    });
  }
  return schedule;
}

function summarize(input: MortgageInput, schedule: Payment[]): MortgageSummary {
  const totalInterest = schedule.reduce((a, p) => a + p.interest, 0);
  const totalPmi = schedule.reduce((a, p) => a + p.pmi, 0);
  const totalEscrow = schedule.reduce((a, p) => a + p.escrow, 0);
  const payoffMonth = schedule.length ? schedule[schedule.length - 1].month : 0;
  const pi = monthlyPrincipalAndInterest(input);
  const firstPmi = schedule.length ? schedule[0].pmi : 0;
  const escrow =
    input.property_tax_annual / 12 + input.home_insurance_annual / 12 + input.hoa_monthly;
  const amount = loanAmount(input);

  let baselineInterest = totalInterest;
  if (input.extra_monthly_payment > 0) {
    const baseline = buildSchedule({ ...input, extra_monthly_payment: 0 });
    baselineInterest = baseline.reduce((a, p) => a + p.interest, 0);
  }

  return {
    loan_amount: amount,
    origination_ltv: amount / input.home_price,
    effective_annual_rate: effectiveAnnualRate(input),
    points_cost: input.points * COST_PER_POINT * amount,
    monthly_principal_and_interest: pi,
    monthly_escrow: escrow,
    first_month_pmi: firstPmi,
    first_month_total_payment: pi + escrow + firstPmi + input.extra_monthly_payment,
    total_interest: totalInterest,
    total_pmi: totalPmi,
    total_escrow: totalEscrow,
    total_of_payments: amount + totalInterest + totalPmi + totalEscrow,
    payoff_month: payoffMonth,
    months_saved: Math.max(0, termMonths(input.term) - payoffMonth),
    interest_saved: Math.max(0, baselineInterest - totalInterest),
  };
}

/** Compute a full result locally, matching the backend response shape. */
export function calculateLocally(input: MortgageInput): MortgageResult {
  const schedule = buildSchedule(input);
  return { input, summary: summarize(input, schedule), schedule };
}
