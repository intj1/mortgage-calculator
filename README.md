# Mortgage Studio

A full-stack mortgage calculator: a **Rust** amortization engine exposed through
a CLI and a REST API, plus an **Angular 22** front end for exploring loans
interactively.

![Rust](https://img.shields.io/badge/Rust-engine-orange)
![Angular](https://img.shields.io/badge/Angular-22-red)

---

## What it does

The engine amortizes a fixed-rate mortgage and models the costs a borrower
actually pays:

- **Principal & interest** — the classic amortization formula (with a correct
  0%-interest fallback).
- **Escrow** — property tax, homeowners insurance and HOA dues.
- **PMI** — private mortgage insurance that **automatically drops off** once the
  loan-to-value ratio reaches 80%.
- **Discount points** — each point costs 1% of the loan and buys the rate down
  by 0.25%; the up-front cost is reported.
- **Extra payments** — optional extra principal each month, with the resulting
  **early payoff date** and **interest saved**.

Every figure comes from a single-pass `O(n)` amortization schedule. Inputs are
validated up front, so bad data yields a clear error instead of a panic.

## Architecture

```
┌─────────────────────┐     POST /api/calculate      ┌──────────────────────┐
│  Angular 22 (SPA)   │ ───────────────────────────▶ │  Rust API (axum)     │
│  standalone + signal│ ◀─────────────────────────── │  mortgage_calculator │
│  SVG charts, themes │        MortgageResult JSON    │  (single source of   │
└─────────────────────┘                               │   truth for the math)│
         │                                            └──────────────────────┘
         │ if the API is unreachable, falls back to
         ▼ an in-browser TypeScript mirror of the engine
   always produces a result
```

The Rust crate is the source of truth — and the browser runs it directly. The
crate compiles to WebAssembly (`cargo build --lib --release --target
wasm32-unknown-unknown`, ~116 kB) with a tiny hand-rolled C ABI
(`src/wasm.rs`, no wasm-bindgen) that passes JSON through linear memory. The
Angular app tries engines in order:

1. **Rust WASM** (`engine.wasm`, fetched at startup) — the same crate as the
   CLI/API, running in your browser, fully offline;
2. **Rust REST API** (`POST /api/calculate`) when wasm isn't available;
3. a TypeScript mirror (`frontend/src/app/services/local-engine.ts`) as the
   last resort.

The header badge shows which engine produced the numbers on screen.

## Project layout

```
src/
  lib.rs                 library root
  loan/mod.rs            the amortization engine + unit tests
  report.rs              terminal report rendering (native only)
  wasm.rs                C-ABI exports for the WebAssembly build
  main.rs                CLI  (binary: mortgage-calc)
  bin/server.rs          REST API (binary: server, axum)
frontend/                Angular 22 app
  src/app/
    models/              TS types mirroring the API JSON
    services/            API client, offline engine, theme
    components/          form, summary cards, SVG charts, table
                         (each component = separate .ts / .html / .scss)
```

## Running the Rust side

Requires a recent stable Rust toolchain.

```bash
# CLI: summary only
cargo run --bin mortgage-calc -- --home-price 747500 --down-payment 75000 --rate 6.75

# CLI: with escrow, PMI and extra payments, first 12 months previewed
cargo run --bin mortgage-calc -- \
  --home-price 400000 --down-payment 40000 --rate 6 \
  --tax 6000 --insurance 1800 --pmi 0.6 --extra 300 --preview 12

# CLI: machine-readable output
cargo run --bin mortgage-calc -- --home-price 400000 --rate 6 --json

# Full amortization table
cargo run --bin mortgage-calc -- --home-price 400000 --rate 6 --schedule

# REST API server (listens on :8080, override with $PORT)
cargo run --bin server
```

Run the test suite:

```bash
cargo test
```

### API

`POST /api/calculate` accepts a `MortgageInput` and returns a `MortgageResult`
(`summary` + full `schedule`). `GET /api/health` returns `{"status":"ok"}`.

```bash
curl -s -X POST http://localhost:8080/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{"home_price":400000,"down_payment":40000,"annual_rate":0.06,
       "term":"thirty_years","pmi_annual_rate":0.006,"extra_monthly_payment":300}'
```

Rates in the JSON API are fractions (`0.06` = 6%). `term` is one of
`"thirty_years"`, `"fifteen_years"`, `"ten_years"`, or `{"custom": <months>}`.

## Running the front end

Requires Node 22.22.3+ / 24+ (Angular 22).

```bash
cd frontend
npm install
npm start          # ng serve on http://localhost:4200
```

To run the real Rust engine in the browser during development, build the wasm
asset once (it is gitignored; CI builds it on deploy):

```bash
rustup target add wasm32-unknown-unknown
cargo build --lib --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/mortgage_calculator.wasm frontend/public/engine.wasm
```

`npm start` also proxies `/api` to the Rust server on `:8080` (see
`frontend/proxy.conf.json`), so `cargo run --bin server` gives you the HTTP
tier. Without either, the app still works on the TypeScript fallback — the
header badge always shows which engine produced the numbers (**Rust WASM**,
**Rust API**, or **Local engine**).

Other commands:

```bash
npm run build      # production bundle in frontend/dist
npm test           # component/engine unit tests (vitest)
```

## Front-end highlights

- **Angular 22**, standalone components and signals throughout — no NgModules.
- **Template, styles and logic are split** into separate files for every
  component.
- Signal-driven form: sliders and number inputs stay in perfect two-way sync,
  with debounced recalculation and mobile-friendly (`touch-action`) sliders.
- **Pin &amp; compare** — freeze the current loan as a baseline, tweak inputs,
  and watch live deltas for payment, total interest, payoff time and total cost.
- **Real calendar dates** — set the first-payment month to see the payoff date
  ("Aug 2056"), dated schedule rows, and a dated CSV.
- **Affordability solver** — enter a target all-in monthly budget and get the
  max home price that fits (with one click to apply it).
- **Biweekly quick-set** — one click adds the "13th payment" equivalent
  (P&amp;I ÷ 12) as a monthly extra payment.
- **Shareable scenarios** — loan inputs are encoded in the URL
  (`?hp=500000&r=5.5&x=300`), a Share button copies the link, and the last
  scenario is restored from `localStorage` on the next visit.
- Insight cards: PMI end month, **discount-points break-even** time, and a
  **rate-sensitivity** (±0.5%) comparison.
- Hand-built **SVG charts** (no charting dependency): a payment-breakdown donut
  and an interactive balance/interest curve with hover crosshair, an early
  **payoff marker**, and a dashed **"without extra payments" baseline** overlay.
- **CSV export** of the full monthly amortization schedule.
- Light/dark theme with system-preference detection, persisted to
  `localStorage`.
