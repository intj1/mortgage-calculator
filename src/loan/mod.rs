use std::fmt;
use tabled::{Table, Tabled};

#[derive(Clone, Debug, Default)]
pub enum Term {
    #[default]
    ThiryYears,
    FiteenYears,
    TenYears
}

impl fmt::Display for Term {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let string_val = match self {
            Term::ThiryYears => "30 Years",
            Term::FiteenYears => "15 Years",
            Term::TenYears => "10 Years"
        };
        write!(f, "{}", string_val)
    }
}

#[derive(Debug, Clone)]
pub struct LoanError {
    error: String
}

impl fmt::Display for LoanError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.error)
    }
}

#[derive(Clone, Debug, Default)]
pub struct Loan {
    pub home_price: f64,
    pub points: f64,
    pub down_payment: f64,
    pub rate: f64,
    pub rate_with_points: f64,
    pub term: Term,
    pub monthly_rate: f64,
    pub monthly_rate_with_points: f64
}

impl fmt::Display for Loan {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "
        *****LOAN DETAILS*****
        Home price: {},
        Down payment: {},
        Term: {}
        Rate: {},
        Point: {},
        Rate with point: {},
        Monthly rate: {},
        Monthly rate with point: {}
        ***********************", 
        self.home_price, self.down_payment, self.term, self.rate, 
        self.points, self.rate_with_points, self.monthly_rate, self.monthly_rate_with_points)
    }
}

#[derive(Clone, Debug, Default, Tabled)]
pub struct Payment {
    pub month: u32,
    pub total_monthly_payment: f64,
    pub interest_payment: f64,
    pub principal_payment: f64,
    pub remaining_principal: f64,
    pub starting_principal: f64
}

impl Loan {
    pub fn new(self) -> Self {
        Loan {
            monthly_rate: self.rate / 12.0,
            rate_with_points: self.rate - (self.points * 0.0025),
            monthly_rate_with_points: (self.rate - (self.points * 0.0025)) / 12.0,
            ..self
        }
    }

    pub fn get_payment_breakdown_for_month(&self, month: u32, with_points: bool) ->  Result<Payment, LoanError> {
        match self.check_month_with_term(month) {
            Ok(_) => (),
            Err(e) => return Err(e)
        }
        let mut remaining_principal = self.home_price - self.down_payment;
        let mut interest_payment = 0.0;

        let total_payment_for_each_month = match self.get_total_payment_each_month(with_points) {
            Some(val) => val,
            None => return Err(LoanError{
                error: "Error encountered when trying to retrieve total payment for each month".to_string()
            })
        };

        let mut principal_payment = 0.0;

        let rate = match with_points {
            true => self.monthly_rate_with_points,
            _ => self.monthly_rate
        };

        for _ in 1..=month {
            if remaining_principal > 0.0 {
                interest_payment = remaining_principal * rate;
                principal_payment = total_payment_for_each_month - interest_payment;
                remaining_principal = remaining_principal - principal_payment;
            }
        };

        Ok(Payment {
            month,
            total_monthly_payment: total_payment_for_each_month,
            interest_payment,
            principal_payment,
            remaining_principal,
            starting_principal: self.home_price - self.down_payment 
        })
        
    }

    pub fn get_total_payment_each_month(&self, with_points: bool) -> Option<f64> {
        let month = match self.term {
            Term::ThiryYears => 360,
            Term::FiteenYears => 180,
            Term::TenYears => 120
        };

        let rate = match with_points {
            true => self.monthly_rate_with_points,
            _ => self.monthly_rate
        };

        let compound_rate = (1.0 + rate).powf(month.into());
        Some(
            (self.home_price - self.down_payment) * ((rate * compound_rate) / (compound_rate - 1.0))
        )
    }

    pub fn get_amortization_table(&self, with_points: bool) -> Option<String> {
        let max_months = match self.term {
            Term::ThiryYears => 360,
            Term::FiteenYears => 180,
            Term::TenYears => 120
        };
        let months: Vec<u32> = (1..=max_months).collect();

        Some(
            Table::new(months
                .iter()
                .map(|&i| {
                    let payment = match self.get_payment_breakdown_for_month(i, with_points) {
                        Ok(p) => p,
                        Err(e) => panic!("{}", e.error)
                    };
                    payment
                })
                .collect::<Vec<Payment>>()
            ).to_string()
        )
    }

    pub fn get_loan_report(&self, with_points: bool) -> String {
        
        let divider = "*************************************************************";

        let table_title = match with_points {
            true => "AMORTIZATION TABLE WITH POINTS",
            _ => "AMORTIZATION TABLE WITHOUT POINTS"
        };

        let amortization_table = match self.get_amortization_table(with_points) {
            Some(table) => table,
            None => "".to_string()
        };
        format!("{}\n{}\n{}\n{}", self, divider, table_title, amortization_table)
    }

    //returns true if month is within term, else throws error
    fn check_month_with_term(&self, month: u32) -> Result<bool, LoanError> {
        match self.term {
            Term::ThiryYears => {
                if month > 360 {
                    return Err(
                        LoanError{error: format!("{month} is outside of max term of 360 months")}
                    );
                }
            },
            Term::FiteenYears => {
                if month > 180 {
                     return Err(
                        LoanError{error: format!("{month} is outside of max term of 180 months")}
                    );
                }
            },
            Term::TenYears => {
                if month > 120 {
                     return Err(
                        LoanError{error: format!("{month} is outside of max term of 120 months")}
                    );

                }
            }
        }
        Ok(true)
    }

    pub fn change_rate(&mut self, rate: f64) {
        self.rate = rate;
        self.monthly_rate = rate / 12.0;
    }
}
