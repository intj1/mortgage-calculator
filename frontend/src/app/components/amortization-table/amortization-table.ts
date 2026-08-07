import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

import { MortgageResult, Payment } from '../../models/mortgage.models';
import { downloadScheduleCsv } from '../../services/csv';

type View = 'yearly' | 'monthly';

interface Row {
  label: string;
  principal: number;
  interest: number;
  extra: number;
  pmi: number;
  balance: number;
}

@Component({
  selector: 'app-amortization-table',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './amortization-table.html',
  styleUrl: './amortization-table.scss',
})
export class AmortizationTableComponent {
  readonly result = input.required<MortgageResult>();

  readonly view = signal<View>('yearly');

  setView(v: View): void {
    this.view.set(v);
  }

  exportCsv(): void {
    downloadScheduleCsv(this.result().schedule);
  }

  readonly rows = computed<Row[]>(() => {
    const schedule = this.result().schedule;
    return this.view() === 'monthly'
      ? schedule.map((p) => this.monthlyRow(p))
      : this.yearlyRows(schedule);
  });

  private monthlyRow(p: Payment): Row {
    return {
      label: `Month ${p.month}`,
      principal: p.principal,
      interest: p.interest,
      extra: p.extra_principal,
      pmi: p.pmi,
      balance: p.ending_balance,
    };
  }

  private yearlyRows(schedule: Payment[]): Row[] {
    const rows: Row[] = [];
    let acc: Row | null = null;
    let year = 1;

    schedule.forEach((p, i) => {
      if (!acc) {
        acc = { label: `Year ${year}`, principal: 0, interest: 0, extra: 0, pmi: 0, balance: 0 };
      }
      acc.principal += p.principal;
      acc.interest += p.interest;
      acc.extra += p.extra_principal;
      acc.pmi += p.pmi;
      acc.balance = p.ending_balance;

      const endOfYear = p.month % 12 === 0;
      const lastRow = i === schedule.length - 1;
      if (endOfYear || lastRow) {
        rows.push(acc);
        acc = null;
        year += 1;
      }
    });
    return rows;
  }
}
