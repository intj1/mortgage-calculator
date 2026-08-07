//! Command-line interface for the mortgage calculator.
//!
//! Examples:
//!   mortgage-calc --home-price 747500 --down-payment 75000 --rate 6.75
//!   mortgage-calc --home-price 400000 --down-payment 40000 --rate 6 \
//!                 --pmi 0.6 --tax 6000 --insurance 1800 --extra 300 --json

use clap::Parser;

use mortgage_calculator::loan::{Loan, MortgageInput, MortgageResult, Term};
use mortgage_calculator::report;

/// Amortize a fixed-rate mortgage with escrow, PMI, points and extra payments.
#[derive(Parser, Debug)]
#[command(name = "mortgage-calc", version, about)]
struct Cli {
    /// Home purchase price in dollars.
    #[arg(long)]
    home_price: f64,

    /// Down payment in dollars.
    #[arg(long, default_value_t = 0.0)]
    down_payment: f64,

    /// Annual interest rate as a percentage, e.g. 6.75.
    #[arg(long)]
    rate: f64,

    /// Term in years (30, 15, 10, or any custom number).
    #[arg(long, default_value_t = 30)]
    years: u32,

    /// Discount points purchased (1 point = 1% of loan, cuts rate 0.25%).
    #[arg(long, default_value_t = 0.0)]
    points: f64,

    /// Annual property tax in dollars.
    #[arg(long = "tax", default_value_t = 0.0)]
    property_tax: f64,

    /// Annual homeowners insurance in dollars.
    #[arg(long = "insurance", default_value_t = 0.0)]
    insurance: f64,

    /// Monthly HOA dues in dollars.
    #[arg(long, default_value_t = 0.0)]
    hoa: f64,

    /// Annual PMI rate as a percentage of the balance, e.g. 0.6.
    #[arg(long = "pmi", default_value_t = 0.0)]
    pmi: f64,

    /// Extra principal paid each month in dollars.
    #[arg(long, default_value_t = 0.0)]
    extra: f64,

    /// Print the full amortization schedule (otherwise only a summary).
    #[arg(long)]
    schedule: bool,

    /// Print a short preview of the first N months.
    #[arg(long)]
    preview: Option<usize>,

    /// Emit JSON instead of a formatted report.
    #[arg(long)]
    json: bool,
}

fn term_from_years(years: u32) -> Term {
    match years {
        30 => Term::ThirtyYears,
        15 => Term::FifteenYears,
        10 => Term::TenYears,
        other => Term::Custom(other * 12),
    }
}

fn main() {
    let cli = Cli::parse();

    let input = MortgageInput {
        home_price: cli.home_price,
        down_payment: cli.down_payment,
        annual_rate: cli.rate / 100.0,
        term: term_from_years(cli.years),
        points: cli.points,
        property_tax_annual: cli.property_tax,
        home_insurance_annual: cli.insurance,
        hoa_monthly: cli.hoa,
        pmi_annual_rate: cli.pmi / 100.0,
        extra_monthly_payment: cli.extra,
    };

    let loan = match Loan::new(input) {
        Ok(loan) => loan,
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    };

    if cli.json {
        let result = MortgageResult::from_loan(&loan);
        match serde_json::to_string_pretty(&result) {
            Ok(s) => println!("{s}"),
            Err(e) => {
                eprintln!("error serializing result: {e}");
                std::process::exit(1);
            }
        }
        return;
    }

    if let Some(n) = cli.preview {
        println!("{}", report::render_preview(&loan, n));
    } else {
        println!("{}", report::render(&loan, cli.schedule));
    }
}
