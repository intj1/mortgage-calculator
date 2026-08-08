import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';

import { MortgageResult, termMonths } from '../../models/mortgage.models';
import { calculateLocally } from '../../services/local-engine';

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

  /** The x axis always spans the full contractual term, so an early payoff
   *  (from extra payments) is visible as the line ending before the edge. */
  private readonly totalMonths = computed(() =>
    Math.max(termMonths(this.result().input.term), this.result().schedule.length, 1),
  );

  private readonly maxY = computed(() => {
    const s = this.result().summary;
    return Math.max(s.loan_amount, s.total_interest, this.noExtraInterest()) * 1.05 || 1;
  });

  /** Total interest without extra payments (for the y scale + overlay). */
  private readonly noExtraInterest = computed(() => {
    const input = this.result().input;
    if (input.extra_monthly_payment <= 0) return 0;
    return this.baselineSchedule()?.reduce((a, p) => a + p.interest, 0) ?? 0;
  });

  /** Comparison schedule with extra payments stripped, when they exist. */
  private readonly baselineSchedule = computed(() => {
    const input = this.result().input;
    if (input.extra_monthly_payment <= 0) return null;
    return calculateLocally({ ...input, extra_monthly_payment: 0 }).schedule;
  });

  private xFor(month: number): number {
    const n = this.totalMonths();
    return PAD.left + (n <= 1 ? 0 : ((month - 1) / (n - 1)) * PLOT_W);
  }

  readonly points = computed<Pt[]>(() => {
    const max = this.maxY();
    return this.result().schedule.map((p) => ({
      month: p.month,
      x: this.xFor(p.month),
      balance: p.ending_balance,
      interest: p.cumulative_interest,
      balanceY: PAD.top + PLOT_H - (p.ending_balance / max) * PLOT_H,
      interestY: PAD.top + PLOT_H - (p.cumulative_interest / max) * PLOT_H,
    }));
  });

  readonly balanceArea = computed(() => {
    const pts = this.points();
    if (!pts.length) return '';
    const top = pts.map((p) => `${p.x.toFixed(1)},${p.balanceY.toFixed(1)}`).join(' L');
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `M${first.x.toFixed(1)},${this.baseline} L${top} L${last.x.toFixed(1)},${this.baseline} Z`;
  });

  readonly balanceLine = computed(() => this.linePath(this.points(), (p) => p.balanceY));
  readonly interestLine = computed(() => this.linePath(this.points(), (p) => p.interestY));

  /** Dashed "what if no extra payments" balance curve. */
  readonly baselineLine = computed(() => {
    const schedule = this.baselineSchedule();
    if (!schedule) return '';
    const max = this.maxY();
    const pts = schedule.map((p) => ({
      x: this.xFor(p.month),
      y: PAD.top + PLOT_H - (p.ending_balance / max) * PLOT_H,
    }));
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  });

  readonly hasBaseline = computed(() => this.baselineSchedule() !== null);

  /** Marker for an early payoff (schedule shorter than the full term). */
  readonly payoffMarker = computed(() => {
    const pts = this.points();
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    if (last.month >= this.totalMonths()) return null;
    return { x: last.x, month: last.month };
  });

  /** Horizontal gridlines with dollar labels. */
  readonly yTicks = computed(() => {
    const max = this.maxY();
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      return { value, y: PAD.top + PLOT_H - (value / max) * PLOT_H };
    });
  });

  /** Year labels along the x axis (full term). */
  readonly xTicks = computed(() => {
    const totalYears = Math.ceil(this.totalMonths() / 12);
    const step = totalYears > 15 ? 5 : totalYears > 8 ? 2 : 1;
    const ticks: { label: string; x: number }[] = [];
    for (let year = 0; year <= totalYears; year += step) {
      // "Ny" marks the point after N*12 payments; payment m sits at offset
      // m-1, so N years elapsed corresponds to month N*12 + 1.
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
    if (pts.length === 0) return;
    // Map the pointer to a month on the full-term axis, then clamp into the
    // (possibly shorter) actual schedule.
    const month = Math.round(frac * (this.totalMonths() - 1)) + 1;
    const idx = Math.max(0, Math.min(pts.length - 1, month - 1));
    this.hoverIndex.set(idx);
  }

  onLeave(): void {
    this.hoverIndex.set(null);
  }

  private linePath(pts: Pt[], accessor: (p: Pt) => number): string {
    if (!pts.length) return '';
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${accessor(p).toFixed(1)}`)
      .join(' ');
  }
}
