import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

import { MortgageResult, Payment, termMonths } from '../../models/mortgage.models';

const W = 960;
const H = 300;
const PAD = { top: 18, right: 16, bottom: 30, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

type BandKey = 'principal' | 'extra' | 'interest' | 'pmi' | 'escrow';

const BAND_ORDER: { key: BandKey; label: string; color: string }[] = [
  { key: 'principal', label: 'Principal', color: 'var(--c-principal)' },
  { key: 'extra', label: 'Extra principal', color: 'var(--c-extra)' },
  { key: 'interest', label: 'Interest', color: 'var(--c-interest)' },
  { key: 'pmi', label: 'PMI', color: 'var(--c-pmi)' },
  { key: 'escrow', label: 'Escrow', color: 'var(--c-escrow)' },
];

function componentOf(p: Payment, key: BandKey): number {
  switch (key) {
    case 'principal':
      return p.principal;
    case 'extra':
      return p.extra_principal;
    case 'interest':
      return p.interest;
    case 'pmi':
      return p.pmi;
    case 'escrow':
      return p.escrow;
  }
}

interface Band {
  key: BandKey;
  label: string;
  color: string;
  path: string;
}

/**
 * Stacked area chart of every monthly payment split into its components.
 * Makes the two big milestones visible: PMI falling off, and the month
 * where principal overtakes interest.
 */
@Component({
  selector: 'app-payment-chart',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './payment-chart.html',
  styleUrl: './payment-chart.scss',
})
export class PaymentChartComponent {
  readonly result = input.required<MortgageResult>();

  readonly viewBox = `0 0 ${W} ${H}`;
  readonly pad = PAD;
  readonly plotW = PLOT_W;
  readonly plotH = PLOT_H;
  readonly baseline = PAD.top + PLOT_H;

  readonly hoverIndex = signal<number | null>(null);

  private readonly totalMonths = computed(() =>
    Math.max(termMonths(this.result().input.term), this.result().schedule.length, 1),
  );

  private readonly maxY = computed(() => {
    const { schedule, input } = this.result();
    // A lump-sum month would blow out the y-scale and squash every other
    // month; scale to the regular payments and let the spike clip.
    const lumpMonth = input.lump_sum > 0 ? input.lump_sum_month : 0;
    const regular = schedule.filter((p) => p.month !== lumpMonth);
    const base = regular.length ? regular : schedule;
    const max = Math.max(...base.map((p) => p.total_payment), 0);
    return max * 1.06 || 1;
  });

  private xFor(month: number): number {
    const n = this.totalMonths();
    return PAD.left + (n <= 1 ? 0 : ((month - 1) / (n - 1)) * PLOT_W);
  }

  private yFor(value: number): number {
    return PAD.top + PLOT_H - (value / this.maxY()) * PLOT_H;
  }

  /** Bands with any substance, each as a closed SVG path. */
  readonly bands = computed<Band[]>(() => {
    const schedule = this.result().schedule;
    if (!schedule.length) return [];

    const active = BAND_ORDER.filter(({ key }) =>
      schedule.some((p) => componentOf(p, key) > 0.005),
    );

    // Running stack: lower edge for the next band is the current cumulative.
    const cumulative = new Array<number>(schedule.length).fill(0);
    return active.map(({ key, label, color }) => {
      const lower = [...cumulative];
      schedule.forEach((p, i) => (cumulative[i] += componentOf(p, key)));

      const forward = schedule
        .map((p, i) => `${this.xFor(p.month).toFixed(1)},${this.yFor(cumulative[i]).toFixed(1)}`)
        .join(' L');
      const backward = [...schedule]
        .reverse()
        .map((p, i) => {
          const idx = schedule.length - 1 - i;
          return `${this.xFor(p.month).toFixed(1)},${this.yFor(lower[idx]).toFixed(1)}`;
        })
        .join(' L');
      return { key, label, color, path: `M${forward} L${backward} Z` };
    });
  });

  /** First month where principal paydown (incl. extra) exceeds interest. */
  readonly crossover = computed(() => {
    const schedule = this.result().schedule;
    const hit = schedule.find((p) => p.principal + p.extra_principal >= p.interest);
    if (!hit || hit.month === 1) return null; // month 1 = nothing to celebrate
    return { month: hit.month, x: this.xFor(hit.month) };
  });

  readonly yTicks = computed(() => {
    const max = this.maxY();
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      return { value, y: this.yFor(value) };
    });
  });

  readonly xTicks = computed(() => {
    const totalYears = Math.ceil(this.totalMonths() / 12);
    const step = totalYears > 15 ? 5 : totalYears > 8 ? 2 : 1;
    const ticks: { label: string; x: number }[] = [];
    for (let year = 0; year <= totalYears; year += step) {
      const month = Math.min(year * 12 + 1, this.totalMonths());
      ticks.push({ label: `${year}y`, x: this.xFor(month) });
    }
    return ticks;
  });

  readonly hover = computed(() => {
    const i = this.hoverIndex();
    const schedule = this.result().schedule;
    if (i === null || i < 0 || i >= schedule.length) return null;
    const p = schedule[i];
    const parts = BAND_ORDER
      .map(({ key, label, color }) => ({ label, color, value: componentOf(p, key) }))
      .filter((part) => part.value > 0.005);
    return { month: p.month, x: this.xFor(p.month), total: p.total_payment, parts };
  });

  onMove(event: PointerEvent): void {
    const target = event.currentTarget as SVGSVGElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const frac = (event.clientX - rect.left) / rect.width;
    const schedule = this.result().schedule;
    if (!schedule.length) return;
    const month = Math.round(frac * (this.totalMonths() - 1)) + 1;
    this.hoverIndex.set(Math.max(0, Math.min(schedule.length - 1, month - 1)));
  }

  onLeave(): void {
    this.hoverIndex.set(null);
  }
}
