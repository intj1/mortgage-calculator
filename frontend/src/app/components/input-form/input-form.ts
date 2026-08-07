import {
  Component,
  OnDestroy,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { FormModel } from '../../models/mortgage.models';

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
  imports: [DecimalPipe],
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

  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.emitTimer !== null) clearTimeout(this.emitTimer);
  }

  value(key: keyof FormModel): number {
    return this.model()[key];
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
