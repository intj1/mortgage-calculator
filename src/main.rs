mod loan;
use loan::{Loan, Term};

fn main() {

    let mut my_loan = loan::Loan{
        rate: 0.0675,
        points: 0.000,
        home_price: 747500.0,
        down_payment: 75000.0,
        term: Term::ThiryYears,
        ..Default::default()
    }.new();

    print!("{}", my_loan.get_loan_report(true));

    dbg!(my_loan.get_total_interest_and_principal_paid_by_month(9, true));

    
}
