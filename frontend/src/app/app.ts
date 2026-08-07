import { Component, inject, signal } from '@angular/core';

import { InputFormComponent } from './components/input-form/input-form';
import { SummaryCardsComponent } from './components/summary-cards/summary-cards';
import { BreakdownChartComponent } from './components/breakdown-chart/breakdown-chart';
import { BalanceChartComponent } from './components/balance-chart/balance-chart';
import { AmortizationTableComponent } from './components/amortization-table/amortization-table';

import { MortgageService } from './services/mortgage.service';
import { ThemeService } from './services/theme.service';
import { FormModel, MortgageResult, formToInput } from './models/mortgage.models';

const DEFAULT_FORM: FormModel = {
  homePrice: 747_500,
  downPayment: 75_000,
  ratePercent: 6.75,
  termYears: 30,
  points: 0,
  propertyTaxAnnual: 8_400,
  homeInsuranceAnnual: 2_100,
  hoaMonthly: 0,
  pmiRatePercent: 0.5,
  extraMonthlyPayment: 0,
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    InputFormComponent,
    SummaryCardsComponent,
    BreakdownChartComponent,
    BalanceChartComponent,
    AmortizationTableComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly mortgage = inject(MortgageService);
  readonly theme = inject(ThemeService);

  readonly initialForm = DEFAULT_FORM;
  readonly result = signal<MortgageResult | null>(null);
  readonly computing = signal(false);

  readonly source = this.mortgage.source;
  readonly backendOnline = this.mortgage.backendOnline;

  constructor() {
    void this.recalculate(DEFAULT_FORM);
  }

  async onFormChange(form: FormModel): Promise<void> {
    await this.recalculate(form);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  private async recalculate(form: FormModel): Promise<void> {
    this.computing.set(true);
    try {
      const result = await this.mortgage.calculate(formToInput(form));
      this.result.set(result);
    } finally {
      this.computing.set(false);
    }
  }
}
