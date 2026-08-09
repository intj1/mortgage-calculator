import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

import { MortgageResult } from '../../models/mortgage.models';
import { RefiInputs, analyzeRefinance } from '../../services/refinance';

/**
 * "Should I refinance?" — compares the current scenario against a new offer:
 * payment delta, break-even on closing costs, and lifetime interest impact.
 */
@Component({
  selector: 'app-refinance-panel',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './refinance-panel.html',
  styleUrl: './refinance-panel.scss',
})
export class RefinancePanelComponent {
  readonly result = input.required<MortgageResult>();

  readonly monthsPaid = signal(24);
  readonly newRatePercent = signal(5.5);
  readonly newTermYears = signal(30);
  readonly closingCosts = signal(6_000);

  readonly analysis = computed(() => {
    const inputs: RefiInputs = {
      monthsPaid: this.monthsPaid(),
      newRatePercent: this.newRatePercent(),
      newTermYears: this.newTermYears(),
      closingCosts: this.closingCosts(),
    };
    return analyzeRefinance(this.result(), inputs);
  });

  readonly breakEven = computed(() => {
    const months = this.analysis()?.breakEvenMonths ?? null;
    if (months === null) return null;
    return { months, years: Math.floor(months / 12), rem: months % 12 };
  });

  set(field: 'monthsPaid' | 'newRatePercent' | 'newTermYears' | 'closingCosts', event: Event): void {
    const n = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(n) || n < 0) return;
    this[field].set(n);
  }
}
