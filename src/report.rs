//! Pretty-printing for terminal output.

use tabled::settings::Style;
use tabled::{Table, Tabled};

use crate::loan::{Loan, MortgageSummary, Payment};

/// A compact, human-friendly view of a [`Payment`] row for the terminal table.
#[derive(Tabled)]
struct PaymentRow {
    #[tabled(rename = "Month")]
    month: u32,
    #[tabled(rename = "Payment")]
    payment: String,
    #[tabled(rename = "Principal")]
    principal: String,
    #[tabled(rename = "Interest")]
    interest: String,
    #[tabled(rename = "Extra")]
    extra: String,
    #[tabled(rename = "PMI")]
    pmi: String,
    #[tabled(rename = "Balance")]
    balance: String,
}

fn money(v: f64) -> String {
    // Simple thousands-separated currency formatting.
    let rounded = (v * 100.0).round() / 100.0;
    let s = format!("{:.2}", rounded.abs());
    let (int_part, frac_part) = s.split_once('.').unwrap_or((s.as_str(), "00"));
    let mut grouped = String::new();
    let bytes = int_part.as_bytes();
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && (bytes.len() - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(*b as char);
    }
    let sign = if rounded < 0.0 { "-" } else { "" };
    format!("{sign}${grouped}.{frac_part}")
}

impl From<&Payment> for PaymentRow {
    fn from(p: &Payment) -> Self {
        PaymentRow {
            month: p.month,
            payment: money(p.total_payment),
            principal: money(p.principal),
            interest: money(p.interest),
            extra: money(p.extra_principal),
            pmi: money(p.pmi),
            balance: money(p.ending_balance),
        }
    }
}

fn summary_block(s: &MortgageSummary) -> String {
    format!(
        "\
┌─ LOAN SUMMARY ───────────────────────────────────────────┐
  Loan amount ............ {loan}
  Loan-to-value .......... {ltv:.1}%
  Effective rate ......... {rate:.3}%
  Points cost ............ {points}
  Monthly P&I ............ {pi}
  Monthly escrow ......... {escrow}
  First-month PMI ........ {pmi}
  First-month total ...... {first_total}
  ---------------------------------------------------------
  Total interest ......... {interest}
  Total PMI .............. {total_pmi}
  Total of all payments .. {total}
  Payoff month ........... {payoff}
  Months saved (extra) ... {months_saved}
  Interest saved (extra) . {interest_saved}
└──────────────────────────────────────────────────────────┘",
        loan = money(s.loan_amount),
        ltv = s.origination_ltv * 100.0,
        rate = s.effective_annual_rate * 100.0,
        points = money(s.points_cost),
        pi = money(s.monthly_principal_and_interest),
        escrow = money(s.monthly_escrow),
        pmi = money(s.first_month_pmi),
        first_total = money(s.first_month_total_payment),
        interest = money(s.total_interest),
        total_pmi = money(s.total_pmi),
        total = money(s.total_of_payments),
        payoff = s.payoff_month,
        months_saved = s.months_saved,
        interest_saved = money(s.interest_saved),
    )
}

/// Render the full report: summary block plus the amortization table.
pub fn render(loan: &Loan, show_schedule: bool) -> String {
    let summary = loan.summary();
    let mut out = summary_block(&summary);

    if show_schedule {
        let rows: Vec<PaymentRow> = loan
            .amortization_schedule()
            .iter()
            .map(PaymentRow::from)
            .collect();
        let table = Table::new(rows).with(Style::rounded()).to_string();
        out.push_str("\n\nAMORTIZATION SCHEDULE\n");
        out.push_str(&table);
    }
    out
}

/// Render only the first `n` months of the schedule (handy for quick previews).
pub fn render_preview(loan: &Loan, months: usize) -> String {
    let summary = loan.summary();
    let mut out = summary_block(&summary);
    let rows: Vec<PaymentRow> = loan
        .amortization_schedule()
        .iter()
        .take(months)
        .map(PaymentRow::from)
        .collect();
    let table = Table::new(rows).with(Style::rounded()).to_string();
    out.push_str(&format!("\n\nFIRST {months} MONTHS\n"));
    out.push_str(&table);
    out
}
