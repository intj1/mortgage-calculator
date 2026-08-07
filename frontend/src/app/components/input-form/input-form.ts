import {
  Component,
  OnInit,
  OnDestroy,
  input,
  output,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

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

@Component({
  selector: 'app-input-form',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './input-form.html',
  styleUrl: './input-form.scss',
})
export class InputFormComponent implements OnInit, OnDestroy {
  /** Initial values for the form. */
  readonly initial = input.required<FormModel>();
  /** Emits a debounced snapshot whenever any field changes. */
  readonly valueChange = output<FormModel>();

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

  form!: FormGroup;
  private sub?: Subscription;

  constructor(private readonly fb: FormBuilder) {}

  ngOnInit(): void {
    const v = this.initial();
    this.form = this.fb.group({
      homePrice: [v.homePrice],
      downPayment: [v.downPayment],
      ratePercent: [v.ratePercent],
      termYears: [v.termYears],
      points: [v.points],
      propertyTaxAnnual: [v.propertyTaxAnnual],
      homeInsuranceAnnual: [v.homeInsuranceAnnual],
      hoaMonthly: [v.hoaMonthly],
      pmiRatePercent: [v.pmiRatePercent],
      extraMonthlyPayment: [v.extraMonthlyPayment],
    });

    this.sub = this.form.valueChanges
      .pipe(debounceTime(120))
      .subscribe(() => this.valueChange.emit(this.snapshot()));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Percentage of the home price currently covered by the down payment. */
  get downPaymentPercent(): number {
    const price = this.form.get('homePrice')!.value || 0;
    const down = this.form.get('downPayment')!.value || 0;
    return price > 0 ? (down / price) * 100 : 0;
  }

  setTerm(years: number): void {
    this.form.get('termYears')!.setValue(years);
  }

  private snapshot(): FormModel {
    const raw = this.form.getRawValue();
    // Coerce to numbers (range/number inputs can yield strings).
    const num = (x: unknown) => Number(x) || 0;
    return {
      homePrice: num(raw.homePrice),
      downPayment: Math.min(num(raw.downPayment), num(raw.homePrice)),
      ratePercent: num(raw.ratePercent),
      termYears: num(raw.termYears),
      points: num(raw.points),
      propertyTaxAnnual: num(raw.propertyTaxAnnual),
      homeInsuranceAnnual: num(raw.homeInsuranceAnnual),
      hoaMonthly: num(raw.hoaMonthly),
      pmiRatePercent: num(raw.pmiRatePercent),
      extraMonthlyPayment: num(raw.extraMonthlyPayment),
    };
  }
}
