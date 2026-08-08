//! Minimal C-ABI surface for the wasm32 build — no wasm-bindgen, just JSON
//! over linear memory.
//!
//! Protocol (from JavaScript):
//!   1. `ptr = wasm_alloc(len)`; write UTF-8 JSON `MortgageInput` at `ptr`.
//!   2. `code = calculate(ptr, len)` — 0 on success, 1 on error.
//!   3. Read `result_len()` bytes at `result_ptr()`: a `MortgageResult` on
//!      success or `{"error": "..."}` on failure. Copy before the next call.
//!   4. `wasm_free(ptr, len)` to release the input buffer.

use std::cell::RefCell;

use crate::loan::{Loan, MortgageInput, MortgageResult};

thread_local! {
    /// Holds the JSON produced by the most recent `calculate` call. Wasm is
    /// single-threaded, so a thread-local is effectively a global here.
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Allocate `len` bytes inside wasm linear memory for the caller to fill.
#[no_mangle]
pub extern "C" fn wasm_alloc(len: usize) -> *mut u8 {
    let mut buf = vec![0u8; len.max(1)];
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Release a buffer previously returned by `wasm_alloc`.
///
/// # Safety
/// `ptr`/`len` must come from a matching `wasm_alloc(len)` call.
#[no_mangle]
pub unsafe extern "C" fn wasm_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, len.max(1), len.max(1)));
}

/// Run the engine on a JSON `MortgageInput`. Returns 0 (ok) or 1 (error);
/// the response JSON is retrievable via `result_ptr`/`result_len`.
///
/// # Safety
/// `ptr` must point to `len` readable bytes inside wasm memory.
#[no_mangle]
pub unsafe extern "C" fn calculate(ptr: *const u8, len: usize) -> i32 {
    let bytes = std::slice::from_raw_parts(ptr, len);

    let outcome = serde_json::from_slice::<MortgageInput>(bytes)
        .map_err(|e| format!("invalid input JSON: {e}"))
        .and_then(|input| Loan::new(input).map_err(|e| e.to_string()))
        .and_then(|loan| {
            serde_json::to_vec(&MortgageResult::from_loan(&loan))
                .map_err(|e| format!("serialization failed: {e}"))
        });

    match outcome {
        Ok(json) => {
            RESULT.with(|r| *r.borrow_mut() = json);
            0
        }
        Err(message) => {
            let err = serde_json::json!({ "error": message });
            RESULT.with(|r| *r.borrow_mut() = serde_json::to_vec(&err).unwrap_or_default());
            1
        }
    }
}

/// Pointer to the last result's bytes.
#[no_mangle]
pub extern "C" fn result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}

/// Length of the last result in bytes.
#[no_mangle]
pub extern "C" fn result_len() -> usize {
    RESULT.with(|r| r.borrow().len())
}
