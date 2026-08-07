//! Core mortgage math: loan definition, validation, amortization and summary.
//!
//! The engine builds the amortization schedule in a single pass (`O(n)` in the
//! number of months) and layers on the real-world costs a borrower actually
//! pays: discount points, PMI that automatically falls off at 80% LTV, escrow
//! (property tax, homeowners insurance, HOA) and optional extra principal
//! payments with early-payoff detection.

use std::fmt;

use serde::{Deserialize, Serialize};

/// One discount point buys the rate down by this fraction (0.25%).
const RATE_REDUCTION_PER_POINT: f64 = 0.0025;
/// One discount point costs this fraction of the loan amount (1%).
const COST_PER_POINT: f64 = 0.01;
/// PMI is required until the loan-to-value ratio reaches this threshold.
const PMI_LTV_THRESHOLD: f64 = 0.80;

/// A repayment term. Common terms are named; anything else is `Custom(months)`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Term {
    ThirtyYears,
    FifteenYears,
    TenYears,
    /// An arbitrary term expressed directly in months.
    Custom(u32),
}

impl Default for Term {
    fn default() -> Self {
        Term::ThirtyYears
    }
}

impl Term {
    /// Number of monthly payments in the term.
    pub fn months(&self) -> u32 {
        match self {
            Term::ThirtyYears => 360,
            Term::FifteenYears => 180,
            Term::TenYears => 120,
            Term::Custom(m) => *m,
        }
    }
}

impl fmt::Display for Term {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Term::ThirtyYears => write!(f, "30 Years"),
            Term::FifteenYears => write!(f, "15 Years"),
            Term::TenYears => write!(f, "10 Years"),
            Term::Custom(m) => write!(f, "{} Months", m),
        }
    }
}

/// Anything that can make a mortgage impossible to calculate.
#[derive(Debug, Clone, PartialEq)]
pub enum LoanError {
    NonPositiveHomePrice(f64),
    NegativeDownPayment(f64),
    DownPaymentTooLarge { home_price: f64, down_payment: f64 },
    NegativeRate(f64),
    NegativePoints(f64),
    ZeroTerm,
    MonthOutOfRange { month: u32, term_months: u32 },
    NegativeAmount { field: &'static str, value: f64 },
}

impl fmt::Display for LoanError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            LoanError::NonPositiveHomePrice(v) => {
                write!(f, "home price must be greater than 0 (got {v})")
            }
            LoanError::NegativeDownPayment(v) => {
                write!(f, "down payment cannot be negative (got {v})")
            }
            LoanError::DownPaymentTooLarge {
                home_price,
                down_payment,
            } => write!(
                f,
                "down payment ({down_payment}) cannot exceed home price ({home_price})"
            ),
            LoanError::NegativeRate(v) => write!(f, "interest rate cannot be negative (got {v})"),
            LoanError::NegativePoints(v) => write!(f, "discount points cannot be negative (got {v})"),
            LoanError::ZeroTerm => write!(f, "loan term must be at least one month"),
            LoanError::MonthOutOfRange { month, term_months } => {
                write!(f, "month {month} is outside the loan term of {term_months} months")
            }
            LoanError::NegativeAmount { field, value } => {
                write!(f, "{field} cannot be negative (got {value})")
            }
        }
    }
}

impl std::error::Error for LoanError {}

/// User-supplied description of a mortgage. This is the API/CLI input shape.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MortgageInput {
    /// Purchase price of the home.
    pub home_price: f64,
    /// Cash paid up front.
    pub down_payment: f64,
    /// Nominal annual interest rate as a fraction (e.g. 0.0675 for 6.75%).
    pub annual_rate: f64,
    /// Repayment term.
    #[serde(default)]
    pub term: Term,
    /// Discount points purchased (each costs 1% of the loan and cuts the rate by 0.25%).
    #[serde(default)]
    pub points: f64,
    /// Annual property tax in dollars.
    #[serde(default)]
    pub property_tax_annual: f64,
    /// Annual homeowners insurance premium in dollars.
    #[serde(default)]
    pub home_insurance_annual: f64,
    /// Monthly HOA / condo dues in dollars.
    #[serde(default)]
    pub hoa_monthly: f64,
    /// Annual PMI rate as a fraction of the loan balance (e.g. 0.005). Applied
    /// each month while the loan-to-value ratio exceeds 80%.
    #[serde(default)]
    pub pmi_annual_rate: f64,
    /// Extra principal paid every month on top of the scheduled payment.
    #[serde(default)]
    pub extra_monthly_payment: f64,
}

impl Default for MortgageInput {
    fn default() -> Self {
        MortgageInput {
            home_price: 0.0,
            down_payment: 0.0,
            annual_rate: 0.0,
            term: Term::default(),
            points: 0.0,
            property_tax_annual: 0.0,
            home_insurance_annual: 0.0,
            hoa_monthly: 0.0,
            pmi_annual_rate: 0.0,
            extra_monthly_payment: 0.0,
        }
    }
}

/// A validated loan derived from a [`MortgageInput`].
#[derive(Clone, Debug)]
pub struct Loan {
    input: MortgageInput,
    /// Principal actually borrowed (`home_price - down_payment`).
    loan_amount: f64,
    /// Effective annual rate after buying down with points.
    effective_annual_rate: f64,
    /// Effective monthly rate after points.
    monthly_rate: f64,
}

impl Loan {
    /// Validate an input and build a `Loan`, or explain why it is impossible.
    pub fn new(input: MortgageInput) -> Result<Self, LoanError> {
        if input.home_price <= 0.0 {
            return Err(LoanError::NonPositiveHomePrice(input.home_price));
        }
        if input.down_payment < 0.0 {
            return Err(LoanError::NegativeDownPayment(input.down_payment));
        }
        if input.down_payment > input.home_price {
            return Err(LoanError::DownPaymentTooLarge {
                home_price: input.home_price,
                down_payment: input.down_payment,
            });
        }
        if input.annual_rate < 0.0 {
            return Err(LoanError::NegativeRate(input.annual_rate));
        }
        if input.points < 0.0 {
            return Err(LoanError::NegativePoints(input.points));
        }
        if input.term.months() == 0 {
            return Err(LoanError::ZeroTerm);
        }
        for (field, value) in [
            ("property_tax_annual", input.property_tax_annual),
            ("home_insurance_annual", input.home_insurance_annual),
            ("hoa_monthly", input.hoa_monthly),
            ("pmi_annual_rate", input.pmi_annual_rate),
            ("extra_monthly_payment", input.extra_monthly_payment),
        ] {
            if value < 0.0 {
                return Err(LoanError::NegativeAmount { field, value });
            }
        }

        let loan_amount = input.home_price - input.down_payment;
        let effective_annual_rate =
            (input.annual_rate - input.points * RATE_REDUCTION_PER_POINT).max(0.0);
        let monthly_rate = effective_annual_rate / 12.0;

        Ok(Loan {
            input,
            loan_amount,
            effective_annual_rate,
            monthly_rate,
        })
    }

    pub fn input(&self) -> &MortgageInput {
        &self.input
    }

    pub fn loan_amount(&self) -> f64 {
        self.loan_amount
    }

    pub fn effective_annual_rate(&self) -> f64 {
        self.effective_annual_rate
    }

    /// Loan-to-value ratio at origination.
    pub fn origination_ltv(&self) -> f64 {
        self.loan_amount / self.input.home_price
    }

    /// Up-front cost of the purchased discount points.
    pub fn points_cost(&self) -> f64 {
        self.input.points * COST_PER_POINT * self.loan_amount
    }

    /// The scheduled principal-and-interest payment (the classic amortization
    /// formula). Handles a 0% loan as an equal split of principal.
    pub fn monthly_principal_and_interest(&self) -> f64 {
        let n = self.input.term.months();
        if self.monthly_rate == 0.0 {
            return self.loan_amount / n as f64;
        }
        let compound = (1.0 + self.monthly_rate).powi(n as i32);
        self.loan_amount * (self.monthly_rate * compound) / (compound - 1.0)
    }

    /// Fixed monthly escrow (tax + insurance + HOA). PMI is *not* included here
    /// because it changes as the balance falls.
    pub fn monthly_escrow(&self) -> f64 {
        self.input.property_tax_annual / 12.0
            + self.input.home_insurance_annual / 12.0
            + self.input.hoa_monthly
    }

    /// Build the full amortization schedule in a single pass. Stops early once
    /// the balance reaches zero (which extra payments can cause).
    pub fn amortization_schedule(&self) -> Vec<Payment> {
        let n = self.input.term.months();
        let base_payment = self.monthly_principal_and_interest();
        let escrow = self.monthly_escrow();
        let monthly_pmi_rate = self.input.pmi_annual_rate / 12.0;

        let mut balance = self.loan_amount;
        let mut cumulative_interest = 0.0;
        let mut cumulative_principal = 0.0;
        let mut schedule = Vec::with_capacity(n as usize);

        for month in 1..=n {
            if balance <= 0.0 {
                break;
            }
            let starting_balance = balance;
            let interest = balance * self.monthly_rate;

            // Scheduled principal, plus any extra, never more than what's owed.
            let mut principal = base_payment - interest;
            if principal < 0.0 {
                principal = 0.0; // guards against pathological inputs
            }
            let mut extra = self.input.extra_monthly_payment;
            if principal + extra > balance {
                // Final payment: only pay what remains.
                let owed = balance;
                if principal > owed {
                    principal = owed;
                    extra = 0.0;
                } else {
                    extra = owed - principal;
                }
            }

            // PMI applies while LTV is above the threshold, based on original value.
            let pmi = if starting_balance / self.input.home_price > PMI_LTV_THRESHOLD {
                starting_balance * monthly_pmi_rate
            } else {
                0.0
            };

            balance -= principal + extra;
            if balance < 0.005 {
                balance = 0.0;
            }
            cumulative_interest += interest;
            cumulative_principal += principal + extra;

            schedule.push(Payment {
                month,
                starting_balance,
                principal_and_interest: interest + principal,
                interest,
                principal,
                extra_principal: extra,
                pmi,
                escrow,
                total_payment: interest + principal + extra + pmi + escrow,
                ending_balance: balance,
                cumulative_interest,
                cumulative_principal,
            });
        }
        schedule
    }

    /// The payment breakdown for a single month (1-indexed).
    pub fn payment_for_month(&self, month: u32) -> Result<Payment, LoanError> {
        let term_months = self.input.term.months();
        if month == 0 || month > term_months {
            return Err(LoanError::MonthOutOfRange { month, term_months });
        }
        self.amortization_schedule()
            .into_iter()
            .find(|p| p.month == month)
            .ok_or(LoanError::MonthOutOfRange { month, term_months })
    }

    /// Total interest and principal paid through the end of `month` (inclusive).
    pub fn totals_through_month(&self, month: u32) -> Result<(f64, f64), LoanError> {
        let term_months = self.input.term.months();
        if month == 0 || month > term_months {
            return Err(LoanError::MonthOutOfRange { month, term_months });
        }
        let schedule = self.amortization_schedule();
        let totals = schedule
            .iter()
            .take_while(|p| p.month <= month)
            .fold((0.0, 0.0), |acc, p| {
                (acc.0 + p.interest, acc.1 + p.principal + p.extra_principal)
            });
        Ok(totals)
    }

    /// A high-level summary of the whole loan.
    pub fn summary(&self) -> MortgageSummary {
        let schedule = self.amortization_schedule();
        let total_interest = schedule.iter().map(|p| p.interest).sum();
        let total_pmi = schedule.iter().map(|p| p.pmi).sum();
        let total_escrow = schedule.iter().map(|p| p.escrow).sum();
        let payoff_month = schedule.last().map(|p| p.month).unwrap_or(0);
        let pi = self.monthly_principal_and_interest();
        let first_pmi = schedule.first().map(|p| p.pmi).unwrap_or(0.0);

        // Interest saved by extra payments = interest on the same loan with no extra.
        let baseline_interest = if self.input.extra_monthly_payment > 0.0 {
            let mut baseline = self.input.clone();
            baseline.extra_monthly_payment = 0.0;
            Loan::new(baseline)
                .map(|l| l.amortization_schedule().iter().map(|p| p.interest).sum())
                .unwrap_or(total_interest)
        } else {
            total_interest
        };

        MortgageSummary {
            loan_amount: self.loan_amount,
            origination_ltv: self.origination_ltv(),
            effective_annual_rate: self.effective_annual_rate,
            points_cost: self.points_cost(),
            monthly_principal_and_interest: pi,
            monthly_escrow: self.monthly_escrow(),
            first_month_pmi: first_pmi,
            first_month_total_payment: pi + self.monthly_escrow() + first_pmi
                + self.input.extra_monthly_payment,
            total_interest,
            total_pmi,
            total_escrow,
            total_of_payments: self.loan_amount + total_interest + total_pmi + total_escrow,
            payoff_month,
            months_saved: self.input.term.months().saturating_sub(payoff_month),
            interest_saved: (baseline_interest - total_interest).max(0.0),
        }
    }
}

/// A single row of the amortization schedule.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Payment {
    pub month: u32,
    pub starting_balance: f64,
    pub principal_and_interest: f64,
    pub interest: f64,
    pub principal: f64,
    pub extra_principal: f64,
    pub pmi: f64,
    pub escrow: f64,
    pub total_payment: f64,
    pub ending_balance: f64,
    pub cumulative_interest: f64,
    pub cumulative_principal: f64,
}

/// Aggregate statistics describing the whole loan.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MortgageSummary {
    pub loan_amount: f64,
    pub origination_ltv: f64,
    pub effective_annual_rate: f64,
    pub points_cost: f64,
    pub monthly_principal_and_interest: f64,
    pub monthly_escrow: f64,
    pub first_month_pmi: f64,
    pub first_month_total_payment: f64,
    pub total_interest: f64,
    pub total_pmi: f64,
    pub total_escrow: f64,
    pub total_of_payments: f64,
    pub payoff_month: u32,
    pub months_saved: u32,
    pub interest_saved: f64,
}

/// Everything a client needs in one JSON response.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MortgageResult {
    pub input: MortgageInput,
    pub summary: MortgageSummary,
    pub schedule: Vec<Payment>,
}

impl MortgageResult {
    pub fn from_loan(loan: &Loan) -> Self {
        MortgageResult {
            input: loan.input().clone(),
            summary: loan.summary(),
            schedule: loan.amortization_schedule(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input() -> MortgageInput {
        MortgageInput {
            home_price: 400_000.0,
            down_payment: 80_000.0,
            annual_rate: 0.06,
            term: Term::ThirtyYears,
            ..Default::default()
        }
    }

    #[test]
    fn rejects_bad_inputs() {
        assert!(matches!(
            Loan::new(MortgageInput { home_price: 0.0, ..base_input() }),
            Err(LoanError::NonPositiveHomePrice(_))
        ));
        assert!(matches!(
            Loan::new(MortgageInput { down_payment: 500_000.0, ..base_input() }),
            Err(LoanError::DownPaymentTooLarge { .. })
        ));
        assert!(matches!(
            Loan::new(MortgageInput { annual_rate: -0.01, ..base_input() }),
            Err(LoanError::NegativeRate(_))
        ));
    }

    #[test]
    fn known_monthly_payment() {
        // $320k at 6% for 30y => ~$1918.56/mo P&I.
        let loan = Loan::new(base_input()).unwrap();
        let pi = loan.monthly_principal_and_interest();
        assert!((pi - 1918.56).abs() < 0.5, "got {pi}");
    }

    #[test]
    fn zero_interest_splits_principal_evenly() {
        let loan = Loan::new(MortgageInput { annual_rate: 0.0, ..base_input() }).unwrap();
        let pi = loan.monthly_principal_and_interest();
        assert!((pi - 320_000.0 / 360.0).abs() < 1e-6);
    }

    #[test]
    fn schedule_pays_off_to_zero() {
        let loan = Loan::new(base_input()).unwrap();
        let schedule = loan.amortization_schedule();
        assert_eq!(schedule.len(), 360);
        assert!(schedule.last().unwrap().ending_balance.abs() < 0.01);
    }

    #[test]
    fn cumulative_principal_equals_loan_amount() {
        let loan = Loan::new(base_input()).unwrap();
        let schedule = loan.amortization_schedule();
        let total_principal: f64 = schedule.iter().map(|p| p.principal + p.extra_principal).sum();
        assert!((total_principal - loan.loan_amount()).abs() < 0.5);
    }

    #[test]
    fn extra_payments_shorten_term_and_save_interest() {
        let with_extra = Loan::new(MortgageInput {
            extra_monthly_payment: 300.0,
            ..base_input()
        })
        .unwrap();
        let summary = with_extra.summary();
        assert!(summary.payoff_month < 360);
        assert!(summary.interest_saved > 0.0);
        assert!(summary.months_saved > 0);
    }

    #[test]
    fn points_buy_down_the_rate_and_cost_money() {
        let loan = Loan::new(MortgageInput { points: 2.0, ..base_input() }).unwrap();
        assert!((loan.effective_annual_rate() - (0.06 - 0.005)).abs() < 1e-9);
        assert!((loan.points_cost() - 320_000.0 * 0.02).abs() < 1e-6);
    }

    #[test]
    fn pmi_applies_then_drops_at_80_percent_ltv() {
        // 10% down => starts above 80% LTV, so PMI in month 1.
        let loan = Loan::new(MortgageInput {
            down_payment: 40_000.0,
            pmi_annual_rate: 0.006,
            ..base_input()
        })
        .unwrap();
        let schedule = loan.amortization_schedule();
        assert!(schedule[0].pmi > 0.0);
        // Eventually PMI must reach zero once enough principal is paid.
        assert!(schedule.iter().any(|p| p.pmi == 0.0));
    }

    #[test]
    fn month_out_of_range_is_an_error() {
        let loan = Loan::new(base_input()).unwrap();
        assert!(matches!(
            loan.payment_for_month(361),
            Err(LoanError::MonthOutOfRange { .. })
        ));
        assert!(loan.payment_for_month(1).is_ok());
    }

    #[test]
    fn totals_through_month_accumulate() {
        let loan = Loan::new(base_input()).unwrap();
        let (interest, principal) = loan.totals_through_month(12).unwrap();
        assert!(interest > 0.0 && principal > 0.0);
        let full = loan.summary();
        assert!(interest < full.total_interest);
    }

    #[test]
    fn custom_term_supported() {
        let loan = Loan::new(MortgageInput { term: Term::Custom(240), ..base_input() }).unwrap();
        assert_eq!(loan.amortization_schedule().len(), 240);
    }
}
