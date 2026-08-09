/**
 * Refinance analysis: given the current loan (the main scenario) and a new
 * offer, compare keeping the loan vs refinancing the remaining balance.
 * Escrow costs continue either way, so the comparison is P&I-only.
 */

import { MortgageResult, monthlyPI } from '../models/mortgage.models';

export interface RefiInputs {
  /** Payments already made on the current loan. */
  monthsPaid: number;
  /** New offer's annual rate in percent (e.g. 5.5). */
  newRatePercent: number;
  /** New offer's term in years. */
  newTermYears: number;
  /** Closing costs, rolled into the new loan. */
  closingCosts: number;
}

export interface RefiAnalysis {
  balanceAtRefi: number;
  newLoanAmount: number;
  oldPayment: number;
  newPayment: number;
  monthlySavings: number;
  oldRemainingInterest: number;
  newTotalInterest: number;
  /** Old remaining interest − (new interest + closing costs). Positive = refi wins. */
  lifetimeSavings: number;
  /** Months for the payment savings to repay the closing costs; null if the payment went up. */
  breakEvenMonths: number | null;
}

export function analyzeRefinance(
  current: MortgageResult,
  inputs: RefiInputs,
): RefiAnalysis | null {
  const { schedule, summary } = current;
  const monthsPaid = Math.max(0, Math.floor(inputs.monthsPaid));
  if (
    !schedule.length ||
    monthsPaid >= schedule.length ||
    inputs.newRatePercent < 0 ||
    inputs.newTermYears <= 0 ||
    inputs.closingCosts < 0
  ) {
    return null;
  }

  const balanceAtRefi =
    monthsPaid === 0 ? summary.loan_amount : schedule[monthsPaid - 1].ending_balance;
  if (balanceAtRefi <= 0) return null;

  const paidInterest = monthsPaid === 0 ? 0 : schedule[monthsPaid - 1].cumulative_interest;
  const oldRemainingInterest = summary.total_interest - paidInterest;

  const newLoanAmount = balanceAtRefi + inputs.closingCosts;
  const newTermMonths = Math.round(inputs.newTermYears * 12);
  const newPayment = monthlyPI(newLoanAmount, inputs.newRatePercent / 100, newTermMonths);
  const newTotalInterest = newPayment * newTermMonths - newLoanAmount;

  const oldPayment = summary.monthly_principal_and_interest;
  const monthlySavings = oldPayment - newPayment;

  return {
    balanceAtRefi,
    newLoanAmount,
    oldPayment,
    newPayment,
    monthlySavings,
    oldRemainingInterest,
    newTotalInterest,
    lifetimeSavings: oldRemainingInterest - (newTotalInterest + inputs.closingCosts),
    breakEvenMonths:
      monthlySavings > 0 ? Math.ceil(inputs.closingCosts / monthlySavings) : null,
  };
}
