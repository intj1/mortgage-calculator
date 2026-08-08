//! Mortgage calculator library.
//!
//! The [`loan`] module holds the core financial engine. [`report`] renders a
//! human-readable amortization report for the CLI (native targets only).
//! On wasm32 the [`wasm`] module exports a C ABI so browsers can run the
//! exact same engine that powers the CLI and the REST API.

pub mod loan;

#[cfg(not(target_arch = "wasm32"))]
pub mod report;

#[cfg(target_arch = "wasm32")]
mod wasm;

pub use loan::{Loan, LoanError, MortgageInput, MortgageResult, MortgageSummary, Payment, Term};
