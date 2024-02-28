mod loan;
use loan::{Loan, Term};

fn main() {

    let mut my_loan = loan::Loan{
        rate: 0.0700,
        points: 1.125,
        home_price: 747500.0,
        down_payment: 75000.0,
        term: Term::ThiryYears,
        ..Default::default()
    }.new();

    print!("{}", my_loan.get_loan_report(true))
    
}
