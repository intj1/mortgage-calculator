import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

import { MortgageResult } from '../../models/mortgage.models';

const W = 660;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

interface Pt {
  month: number;
  x: number;
  balanceY: number;
  interestY: number;
  balance: number;
  interest: number;
}

@Component({
  selector: 'app-balance-chart',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './balance-chart.html',
  styleUrl: './balance-chart.scss',
})
export class BalanceChartComponent {
  readonly result = input.required<MortgageResult>();

  readonly viewBox = `0 0 ${W} ${H}`;
  readonly pad = PAD;
  readonly plotW = PLOT_W;
  readonly plotH = PLOT_H;
  readonly baseline = PAD.top + PLOT_H;

  readonly hoverIndex = signal<number | null>(null);

  private readonly maxY = computed(() => {
    const s = this.result().summary;
    return Math.max(s.loan_amount, s.total_interest) * 1.05 || 1;
  });

  readonly points = computed<Pt[]>(() => {
    const schedule = this.result().schedule;
    const n = schedule.length;
    const max = this.maxY();
    return schedule.map((p, i) => {
      const x = PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
      return {
        month: p.month,
        x,
        balance: p.ending_balance,
        interest: p.cumulative_interest,
        balanceY: PAD.top + PLOT_H - (p.ending_balance / max) * PLOT_H,
        interestY: PAD.top + PLOT_H - (p.cumulative_interest / max) * PLOT_H,
      };
    });
  });

  readonly balanceArea = computed(() => {
    const pts = this.points();
    if (!pts.length) return '';
    const top = pts.map((p) => `${p.x.toFixed(1)},${p.balanceY.toFixed(1)}`).join(' L');
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `M${first.x.toFixed(1)},${this.baseline} L${top} L${last.x.toFixed(1)},${this.baseline} Z`;
  });

  readonly balanceLine = computed(() => this.linePath((p) => p.balanceY));
  readonly interestLine = computed(() => this.linePath((p) => p.interestY));

  /** Horizontal gridlines with dollar labels. */
  readonly yTicks = computed(() => {
    const max = this.maxY();
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      return { value, y: PAD.top + PLOT_H - (value / max) * PLOT_H };
    });
  });

  /** Year labels along the x axis. */
  readonly xTicks = computed(() => {
    const pts = this.points();
    if (!pts.length) return [];
    const totalYears = Math.ceil(pts[pts.length - 1].month / 12);
    const step = totalYears > 15 ? 5 : totalYears > 8 ? 2 : 1;
    const ticks: { label: string; x: number }[] = [];
    for (let year = 0; year <= totalYears; year += step) {
      const idx = Math.min(year * 12, pts.length - 1);
      ticks.push({ label: `${year}y`, x: pts[idx].x });
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
    const n = this.points().length;
    if (n === 0) return;
    const idx = Math.round(frac * (n - 1));
    this.hoverIndex.set(Math.max(0, Math.min(n - 1, idx)));
  }

  onLeave(): void {
    this.hoverIndex.set(null);
  }

  private linePath(accessor: (p: Pt) => number): string {
    const pts = this.points();
    if (!pts.length) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${accessor(p).toFixed(1)}`)
      .join(' ');
  }
}
