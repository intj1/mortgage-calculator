/** CSV export of the amortization schedule. */

import { Payment, monthLabel } from '../models/mortgage.models';

const HEADERS = [
  'month',
  'date',
  'total_payment',
  'principal',
  'interest',
  'extra_principal',
  'pmi',
  'escrow',
  'ending_balance',
  'cumulative_interest',
  'cumulative_principal',
] as const;

/** Render the schedule as CSV text (2-decimal dollar values). */
export function scheduleToCsv(schedule: Payment[], startMonth = ''): string {
  const rows = schedule.map((p) =>
    [
      p.month,
      monthLabel(startMonth, p.month - 1) ?? '',
      p.total_payment.toFixed(2),
      p.principal.toFixed(2),
      p.interest.toFixed(2),
      p.extra_principal.toFixed(2),
      p.pmi.toFixed(2),
      p.escrow.toFixed(2),
      p.ending_balance.toFixed(2),
      p.cumulative_interest.toFixed(2),
      p.cumulative_principal.toFixed(2),
    ].join(','),
  );
  return [HEADERS.join(','), ...rows].join('\n') + '\n';
}

/** Trigger a browser download of the schedule as amortization.csv. */
export function downloadScheduleCsv(schedule: Payment[], startMonth = ''): void {
  const blob = new Blob([scheduleToCsv(schedule, startMonth)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amortization.csv';
  a.click();
  URL.revokeObjectURL(url);
}
