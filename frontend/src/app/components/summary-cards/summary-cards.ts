import { Component, computed, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';

import {
  MortgageResult,
  monthlyPI,
  termMonths,
} from '../../models/mortgage.models';

const RATE_REDUCTION_PER_POINT = 0.0025;

@Component({
  selector: 'app-summary-cards',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, PercentPipe],
  templateUrl: './summary-cards.html',
  styleUrl: './summary-cards.scss',
})
export class SummaryCardsComponent {
  readonly result = input.required<MortgageResult>();

  readonly summary = computed(() => this.result().summary);

  /** Years and months representation of the payoff month. */
  readonly payoff = computed(() => {
    const m = this.summary().payoff_month;
    return { years: Math.floor(m / 12), months: m % 12 };
  });

  readonly saved = computed(() => {
    const m = this.summary().months_saved;
    return { years: Math.floor(m / 12), months: m % 12 };
  });

  readonly hasExtra = computed(() => this.summary().months_saved > 0);

  /** Last month in which PMI is charged (0 when no PMI at all). */
  readonly pmiEndMonth = computed(() => {
    let last = 0;
    for (const p of this.result().schedule) {
      if (p.pmi > 0) last = p.month;
    }
    return last;
  });

  /**
   * How long the buyer must hold the loan for purchased discount points to
   * recoup their up-front cost via the lower monthly payment.
   */
  readonly pointsBreakEven = computed(() => {
    const { input, summary } = this.result();
    if (input.points <= 0 || summary.points_cost <= 0) return null;
    const n = termMonths(input.term);
    const piWithoutPoints = monthlyPI(summary.loan_amount, input.annual_rate, n);
    const monthlySavings = piWithoutPoints - summary.monthly_principal_and_interest;
    if (monthlySavings <= 0) return null;
    const months = Math.ceil(summary.points_cost / monthlySavings);
    return {
      months,
      years: Math.floor(months / 12),
      remMonths: months % 12,
      monthlySavings,
      worthIt: months < n,
    };
  });

  /** Monthly P&I at ±0.5% around the chosen rate — how sensitive is the payment? */
  readonly rateSensitivity = computed(() => {
    const { input, summary } = this.result();
    const n = termMonths(input.term);
    const amount = summary.loan_amount;
    const buyDown = input.points * RATE_REDUCTION_PER_POINT;
    const current = summary.monthly_principal_and_interest;
    return [-0.005, 0.005].map((delta) => {
      const rate = Math.max(0, input.annual_rate + delta - buyDown);
      const pi = monthlyPI(amount, rate, n);
      return { deltaPercent: delta * 100, rate, pi, diff: pi - current };
    });
  });
}
