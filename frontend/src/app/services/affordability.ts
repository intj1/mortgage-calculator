/**
 * Inverse solver: given a target total monthly payment, find the highest home
 * price that fits while holding every other input (down payment, rate, term,
 * escrow costs, PMI rate, extra payment) fixed.
 */

import { FormModel, formToInput, sanitizeForm } from '../models/mortgage.models';
import { calculateLocally } from './local-engine';

const MIN_PRICE = 50_000;
const MAX_PRICE = 10_000_000;

function firstMonthPayment(base: FormModel, price: number): number {
  const form = sanitizeForm({
    ...base,
    homePrice: price,
    downPayment: Math.min(base.downPayment, price),
  });
  return calculateLocally(formToInput(form)).summary.first_month_total_payment;
}

/**
 * Largest price (rounded down to $1,000) whose first-month payment stays at or
 * under `targetMonthly`. Returns null when even the minimum price is over
 * budget, and caps out at $10M. Payment is monotonic in price, so a binary
 * search converges quickly.
 */
export function maxAffordablePrice(targetMonthly: number, base: FormModel): number | null {
  if (!Number.isFinite(targetMonthly) || targetMonthly <= 0) return null;
  if (firstMonthPayment(base, MIN_PRICE) > targetMonthly) return null;
  if (firstMonthPayment(base, MAX_PRICE) <= targetMonthly) return MAX_PRICE;

  let lo = MIN_PRICE;
  let hi = MAX_PRICE;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (firstMonthPayment(base, mid) <= targetMonthly) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.floor(lo / 1000) * 1000;
}
