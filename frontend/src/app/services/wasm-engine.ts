/**
 * Loader for the real Rust engine compiled to WebAssembly (engine.wasm).
 *
 * The wasm module is the same `mortgage_calculator` crate that powers the CLI
 * and the REST API — no wasm-bindgen, just a small C ABI passing JSON through
 * linear memory (see `src/wasm.rs` in the repo root):
 *
 *   wasm_alloc(len) -> ptr        allocate an input buffer
 *   calculate(ptr, len) -> 0|1    run the engine (1 = error)
 *   result_ptr()/result_len()     locate the response JSON
 *   wasm_free(ptr, len)           release the input buffer
 */

import { MortgageInput, MortgageResult } from '../models/mortgage.models';

interface EngineExports {
  memory: WebAssembly.Memory;
  wasm_alloc(len: number): number;
  wasm_free(ptr: number, len: number): void;
  calculate(ptr: number, len: number): number;
  result_ptr(): number;
  result_len(): number;
}

let enginePromise: Promise<EngineExports | null> | null = null;

async function instantiate(): Promise<EngineExports | null> {
  try {
    const url = new URL('engine.wasm', document.baseURI).toString();
    let instance: WebAssembly.Instance;
    try {
      // Fast path; requires the server to send Content-Type: application/wasm.
      ({ instance } = await WebAssembly.instantiateStreaming(fetch(url)));
    } catch {
      // Some static servers mislabel .wasm — fall back to ArrayBuffer.
      const bytes = await (await fetch(url)).arrayBuffer();
      ({ instance } = await WebAssembly.instantiate(bytes));
    }
    const exports = instance.exports as unknown as EngineExports;
    if (
      typeof exports.calculate !== 'function' ||
      typeof exports.wasm_alloc !== 'function' ||
      !(exports.memory instanceof WebAssembly.Memory)
    ) {
      return null;
    }
    return exports;
  } catch {
    return null; // engine.wasm missing (e.g. plain `ng serve`) or unsupported
  }
}

/** Load the wasm engine once; resolves null when unavailable. */
export function loadWasmEngine(): Promise<EngineExports | null> {
  enginePromise ??= instantiate();
  return enginePromise;
}

/**
 * Run a calculation on the Rust wasm engine. Throws when the engine is
 * unavailable or reports an error, so callers can fall back.
 */
export async function calculateWithWasm(input: MortgageInput): Promise<MortgageResult> {
  const engine = await loadWasmEngine();
  if (!engine) throw new Error('wasm engine unavailable');

  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const ptr = engine.wasm_alloc(bytes.length);
  new Uint8Array(engine.memory.buffer).set(bytes, ptr);
  const code = engine.calculate(ptr, bytes.length);
  engine.wasm_free(ptr, bytes.length);

  // Re-read memory after the call — growth may have replaced the buffer.
  const out = new Uint8Array(
    engine.memory.buffer,
    engine.result_ptr(),
    engine.result_len(),
  );
  const json = JSON.parse(new TextDecoder().decode(out));
  if (code !== 0) {
    throw new Error(typeof json?.error === 'string' ? json.error : 'engine error');
  }
  return json as MortgageResult;
}
