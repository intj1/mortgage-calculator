import {
  Component,
  OnDestroy,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

import { FormModel, monthlyPI, termMonths, formToInput } from '../../models/mortgage.models';
import { maxAffordablePrice } from '../../services/affordability';

interface FieldConfig {
  key: keyof FormModel;
  label: string;
  min: number;
  max: number;
  step: number;
  /** 'currency' | 'percent' | 'plain' — controls the adornment shown. */
  kind: 'currency' | 'percent' | 'plain';
  hint?: string;
}

/**
 * The loan input panel. A single signal holds the form state and both the
 * slider and the number box of each field render from it, so moving either
 * control immediately updates the other (two controls bound to one reactive
 * FormControl do NOT sync view-to-view, which is why this component avoids
 * reactive forms).
 */
@Component({
  selector: 'app-input-form',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './input-form.html',
  styleUrl: './input-form.scss',
})
export class InputFormComponent implements OnDestroy {
  /** Initial values for the form. */
  readonly initial = input.required<FormModel>();
  /** Emits a debounced snapshot whenever any field changes. */
  readonly valueChange = output<FormModel>();

  /** Single source of truth for every field; resets if `initial` changes. */
  readonly model = linkedSignal(() => this.initial());

  readonly termOptions = [30, 15, 10];

  /** Sliders + number inputs are generated from this config. */
  readonly fields: FieldConfig[] = [
    { key: 'homePrice', label: 'Home price', min: 50_000, max: 3_000_000, step: 5_000, kind: 'currency' },
    { key: 'downPayment', label: 'Down payment', min: 0, max: 1_500_000, step: 5_000, kind: 'currency' },
    { key: 'ratePercent', label: 'Interest rate', min: 0, max: 15, step: 0.05, kind: 'percent' },
    { key: 'points', label: 'Discount points', min: 0, max: 4, step: 0.25, kind: 'plain', hint: '1 pt = 1% of loan, −0.25% rate' },
    { key: 'propertyTaxAnnual', label: 'Property tax / yr', min: 0, max: 60_000, step: 250, kind: 'currency' },
    { key: 'homeInsuranceAnnual', label: 'Insurance / yr', min: 0, max: 20_000, step: 100, kind: 'currency' },
    { key: 'hoaMonthly', label: 'HOA / mo', min: 0, max: 2_000, step: 25, kind: 'currency' },
    { key: 'pmiRatePercent', label: 'PMI rate / yr', min: 0, max: 2, step: 0.05, kind: 'percent', hint: 'Drops off at 80% LTV' },
    { key: 'extraMonthlyPayment', label: 'Extra payment / mo', min: 0, max: 5_000, step: 50, kind: 'currency' },
  ];

  /** Percentage of the home price currently covered by the down payment. */
  readonly downPaymentPercent = computed(() => {
    const m = this.model();
    return m.homePrice > 0 ? (m.downPayment / m.homePrice) * 100 : 0;
  });

  /**
   * The "13th payment" trick: paying biweekly makes 26 half-payments a year,
   * one extra full P&I payment — the same as adding P&I/12 to every month.
   */
  readonly biweeklyExtra = computed(() => {
    const input = formToInput(this.model());
    const pi = monthlyPI(
      input.home_price - input.down_payment,
      Math.max(0, input.annual_rate - input.points * 0.0025),
      termMonths(input.term),
    );
    return Math.round(pi / 12);
  });

  /** Affordability solver: target total monthly budget → max home price. */
  readonly targetPayment = signal(4_000);
  readonly maxPrice = computed(() =>
    maxAffordablePrice(this.targetPayment(), this.model()),
  );

  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.emitTimer !== null) clearTimeout(this.emitTimer);
  }

  value(key: keyof FormModel): number {
    // Field configs only reference the numeric keys of FormModel.
    return this.model()[key] as number;
  }

  /** The down-payment slider is capped at the current home price. */
  sliderMax(f: FieldConfig): number {
    return f.key === 'downPayment'
      ? Math.min(f.max, this.model().homePrice)
      : f.max;
  }

  onInput(key: keyof FormModel, event: Event): void {
    const el = event.target as HTMLInputElement;
    const n = el.valueAsNumber;
    this.patch({ [key]: Number.isFinite(n) ? n : 0 });
  }

  setTerm(years: number): void {
    this.patch({ termYears: years });
  }

  onStartMonth(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}$/.test(value)) {
      this.patch({ startMonth: value });
    }
  }

  applyBiweekly(): void {
    this.patch({ extraMonthlyPayment: this.biweeklyExtra() });
  }

  onTargetPayment(event: Event): void {
    const n = (event.target as HTMLInputElement).valueAsNumber;
    this.targetPayment.set(Number.isFinite(n) ? n : 0);
  }

  applyMaxPrice(): void {
    const price = this.maxPrice();
    if (price !== null) {
      this.patch({ homePrice: price });
    }
  }

  private patch(partial: Partial<FormModel>): void {
    this.model.update((m) => {
      const next = { ...m, ...partial };
      next.downPayment = Math.min(next.downPayment, next.homePrice);
      return next;
    });
    if (this.emitTimer !== null) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.valueChange.emit(this.model()), 120);
  }
}
