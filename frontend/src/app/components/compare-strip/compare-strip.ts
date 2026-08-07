import { Component, computed, input, output } from '@angular/core';

import { MortgageResult } from '../../models/mortgage.models';

interface CompareRow {
  label: string;
  pinned: string;
  current: string;
  /** current − pinned; negative is an improvement for every metric shown. */
  delta: number;
  deltaText: string;
}

function money(v: number): string {
  const sign = v < 0 ? '−' : '';
  return sign + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
}

function months(v: number): string {
  const y = Math.floor(Math.abs(v) / 12);
  const m = Math.round(Math.abs(v) % 12);
  const sign = v < 0 ? '−' : '';
  if (y === 0) return `${sign}${m}mo`;
  return m === 0 ? `${sign}${y}y` : `${sign}${y}y ${m}m`;
}

/**
 * Side-by-side comparison of a pinned baseline scenario against the live one.
 * For every metric shown, lower is better, so negative deltas render green.
 */
@Component({
  selector: 'app-compare-strip',
  standalone: true,
  templateUrl: './compare-strip.html',
  styleUrl: './compare-strip.scss',
})
export class CompareStripComponent {
  readonly pinned = input.required<MortgageResult>();
  readonly current = input.required<MortgageResult>();
  readonly unpin = output<void>();

  readonly rows = computed<CompareRow[]>(() => {
    const p = this.pinned().summary;
    const c = this.current().summary;
    const rows: CompareRow[] = [];

    const push = (
      label: string,
      pv: number,
      cv: number,
      fmt: (v: number) => string,
      deltaFmt: (v: number) => string,
    ) => {
      const delta = cv - pv;
      rows.push({
        label,
        pinned: fmt(pv),
        current: fmt(cv),
        delta,
        deltaText: (delta > 0 ? '+' : '') + deltaFmt(delta),
      });
    };

    push('Monthly payment', p.first_month_total_payment, c.first_month_total_payment, money, money);
    push('Total interest', p.total_interest, c.total_interest, money, money);
    push('Payoff time', p.payoff_month, c.payoff_month, months, months);
    push('Total of payments', p.total_of_payments, c.total_of_payments, money, money);
    return rows;
  });
}
