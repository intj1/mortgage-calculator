//! REST API server exposing the mortgage engine over HTTP.
//!
//! Endpoints:
//!   GET  /api/health           -> { "status": "ok" }
//!   POST /api/calculate        -> full MortgageResult (summary + schedule)
//!
//! Run with: `cargo run --bin server` (listens on 0.0.0.0:8080, or $PORT).

use std::net::SocketAddr;

use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use mortgage_calculator::loan::{Loan, MortgageInput, MortgageResult};

async fn health() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

async fn calculate(Json(input): Json<MortgageInput>) -> impl IntoResponse {
    match Loan::new(input) {
        Ok(loan) => (StatusCode::OK, Json(json!(MortgageResult::from_loan(&loan)))).into_response(),
        Err(e) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/calculate", post(calculate))
        .layer(cors);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    println!("mortgage-calculator API listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind address");
    axum::serve(listener, app)
        .await
        .expect("server error");
}
