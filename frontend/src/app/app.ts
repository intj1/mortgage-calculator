import { Component, inject, signal } from '@angular/core';

import { InputFormComponent } from './components/input-form/input-form';
import { SummaryCardsComponent } from './components/summary-cards/summary-cards';
import { BreakdownChartComponent } from './components/breakdown-chart/breakdown-chart';
import { BalanceChartComponent } from './components/balance-chart/balance-chart';
import { AmortizationTableComponent } from './components/amortization-table/amortization-table';

import { MortgageService } from './services/mortgage.service';
import { ThemeService } from './services/theme.service';
import {
  decodeShareParams,
  encodeShareParams,
  loadSavedForm,
  saveForm,
} from './services/share';
import {
  DEFAULT_FORM,
  FormModel,
  MortgageResult,
  formToInput,
} from './models/mortgage.models';

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

  /** Priority: shared URL > last saved scenario > defaults. */
  readonly initialForm: FormModel =
    decodeShareParams(location.search) ?? loadSavedForm() ?? DEFAULT_FORM;

  readonly currentForm = signal<FormModel>(this.initialForm);
  readonly result = signal<MortgageResult | null>(null);
  readonly computing = signal(false);
  readonly copied = signal(false);

  readonly source = this.mortgage.source;
  readonly backendOnline = this.mortgage.backendOnline;

  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.recalculate(this.initialForm);
  }

  async onFormChange(form: FormModel): Promise<void> {
    this.currentForm.set(form);
    saveForm(form);
    this.syncUrl(form);
    await this.recalculate(form);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  /** Copy a shareable link for the current scenario to the clipboard. */
  async copyShareLink(): Promise<void> {
    const url = this.shareUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (http, permissions) — fall back to prompt.
      window.prompt('Copy this link:', url);
    }
    this.copied.set(true);
    if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 1600);
  }

  private shareUrl(): string {
    const query = encodeShareParams(this.currentForm());
    return location.origin + location.pathname + (query ? `?${query}` : '');
  }

  /** Keep the address bar in sync so refresh/bookmark preserves the scenario. */
  private syncUrl(form: FormModel): void {
    const query = encodeShareParams(form);
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
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
