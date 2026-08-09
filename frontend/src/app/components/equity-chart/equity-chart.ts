import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

import { MortgageResult, termMonths } from '../../models/mortgage.models';

const W = 960;
const H = 300;
const PAD = { top: 18, right: 16, bottom: 30, left: 62 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

interface Pt {
  month: number;
  x: number;
  value: number;
  balance: number;
  equity: number;
  valueY: number;
  balanceY: number;
}

/**
 * Home equity over time: projected home value (at the assumed appreciation
 * rate) vs the loan balance, with the gap — your equity — shaded.
 */
@Component({
  selector: 'app-equity-chart',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './equity-chart.html',
  styleUrl: './equity-chart.scss',
})
export class EquityChartComponent {
  readonly result = input.required<MortgageResult>();
  /** Assumed annual appreciation in percent (e.g. 3). */
  readonly appreciationPercent = input<number>(0);

  readonly viewBox = `0 0 ${W} ${H}`;
  readonly pad = PAD;
  readonly plotW = PLOT_W;
  readonly baseline = PAD.top + PLOT_H;

  readonly hoverIndex = signal<number | null>(null);

  private readonly totalMonths = computed(() =>
    Math.max(termMonths(this.result().input.term), this.result().schedule.length, 1),
  );

  private readonly monthlyGrowth = computed(() =>
    Math.pow(1 + this.appreciationPercent() / 100, 1 / 12),
  );

  private readonly maxY = computed(() => {
    const { input } = this.result();
    const finalValue = input.home_price * Math.pow(this.monthlyGrowth(), this.totalMonths());
    return Math.max(finalValue, input.home_price) * 1.05 || 1;
  });

  private xFor(month: number): number {
    const n = this.totalMonths();
    return PAD.left + (n <= 1 ? 0 : ((month - 1) / (n - 1)) * PLOT_W);
  }

  private yFor(v: number): number {
    return PAD.top + PLOT_H - (v / this.maxY()) * PLOT_H;
  }

  /** One point per month across the FULL term (balance 0 after payoff). */
  readonly points = computed<Pt[]>(() => {
    const { input, schedule } = this.result();
    const growth = this.monthlyGrowth();
    const n = this.totalMonths();
    const pts: Pt[] = [];
    for (let month = 1; month <= n; month++) {
      const value = input.home_price * Math.pow(growth, month);
      const balance = schedule[month - 1]?.ending_balance ?? 0;
      pts.push({
        month,
        x: this.xFor(month),
        value,
        balance,
        equity: value - balance,
        valueY: this.yFor(value),
        balanceY: this.yFor(balance),
      });
    }
    return pts;
  });

  readonly valueLine = computed(() => this.line((p) => p.valueY));
  readonly balanceLine = computed(() => this.line((p) => p.balanceY));

  /** Shaded region between home value (top) and balance (bottom). */
  readonly equityArea = computed(() => {
    const pts = this.points();
    if (!pts.length) return '';
    const top = pts.map((p) => `${p.x.toFixed(1)},${p.valueY.toFixed(1)}`).join(' L');
    const bottom = [...pts]
      .reverse()
      .map((p) => `${p.x.toFixed(1)},${p.balanceY.toFixed(1)}`)
      .join(' L');
    return `M${top} L${bottom} Z`;
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

  readonly hover = computed<Pt | null>(() => {
    const i = this.hoverIndex();
    const pts = this.points();
    if (i === null || i < 0 || i >= pts.length) return null;
    return pts[i];
  });

  onMove(event: PointerEvent): void {
    const target = event.currentTarget as SVGSVGElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const frac = (event.clientX - rect.left) / rect.width;
    const pts = this.points();
    if (!pts.length) return;
    const idx = Math.round(frac * (pts.length - 1));
    this.hoverIndex.set(Math.max(0, Math.min(pts.length - 1, idx)));
  }

  onLeave(): void {
    this.hoverIndex.set(null);
  }

  private line(accessor: (p: Pt) => number): string {
    const pts = this.points();
    if (!pts.length) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${accessor(p).toFixed(1)}`)
      .join(' ');
  }
}
