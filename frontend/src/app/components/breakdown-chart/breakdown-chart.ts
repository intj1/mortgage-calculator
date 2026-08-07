import { Component, computed, input } from '@angular/core';
import { CurrencyPipe, PercentPipe } from '@angular/common';

import { MortgageResult } from '../../models/mortgage.models';

interface Segment {
  label: string;
  value: number;
  color: string;
  dash: number;
  offset: number;
  fraction: number;
}

const RADIUS = 62;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

@Component({
  selector: 'app-breakdown-chart',
  standalone: true,
  imports: [CurrencyPipe, PercentPipe],
  templateUrl: './breakdown-chart.html',
  styleUrl: './breakdown-chart.scss',
})
export class BreakdownChartComponent {
  readonly result = input.required<MortgageResult>();

  readonly radius = RADIUS;
  readonly circumference = CIRCUMFERENCE;

  /** The first scheduled payment, broken into its cost components. */
  readonly segments = computed<Segment[]>(() => {
    const first = this.result().schedule[0];
    if (!first) return [];

    const parts = [
      { label: 'Principal', value: first.principal, color: 'var(--c-principal)' },
      { label: 'Interest', value: first.interest, color: 'var(--c-interest)' },
      { label: 'Extra principal', value: first.extra_principal, color: 'var(--c-extra)' },
      { label: 'PMI', value: first.pmi, color: 'var(--c-pmi)' },
      { label: 'Escrow', value: first.escrow, color: 'var(--c-escrow)' },
    ].filter((p) => p.value > 0.005);

    const total = parts.reduce((a, p) => a + p.value, 0) || 1;

    let cumulative = 0;
    return parts.map((p) => {
      const fraction = p.value / total;
      const dash = fraction * CIRCUMFERENCE;
      const offset = -cumulative * CIRCUMFERENCE;
      cumulative += fraction;
      return { ...p, dash, offset, fraction };
    });
  });

  readonly total = computed(() =>
    this.segments().reduce((a, s) => a + s.value, 0),
  );
}
