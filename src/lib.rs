//! Mortgage calculator library.
//!
//! The [`loan`] module holds the core financial engine. [`report`] renders a
//! human-readable amortization report for the CLI.

pub mod loan;
pub mod report;

pub use loan::{Loan, LoanError, MortgageInput, MortgageResult, MortgageSummary, Payment, Term};
