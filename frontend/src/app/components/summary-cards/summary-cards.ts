import { Component, computed, input } from '@angular/core';
import { CurrencyPipe, PercentPipe } from '@angular/common';

import { MortgageResult } from '../../models/mortgage.models';

@Component({
  selector: 'app-summary-cards',
  standalone: true,
  imports: [CurrencyPipe, PercentPipe],
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
}
