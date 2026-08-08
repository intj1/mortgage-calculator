import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { MortgageInput, MortgageResult } from '../models/mortgage.models';
import { calculateLocally } from './local-engine';
import { calculateWithWasm, loadWasmEngine } from './wasm-engine';

/** Where the computation came from, surfaced in the UI. */
export type ComputeSource = 'wasm' | 'backend' | 'local';

/**
 * Computes mortgage results with a three-tier engine chain:
 *
 *   1. The real Rust engine compiled to WebAssembly (engine.wasm) — fastest,
 *      works offline, and is byte-for-byte the same crate as the backend.
 *   2. The Rust REST API (`POST /api/calculate`) when wasm isn't available
 *      (e.g. `ng serve` without a wasm build).
 *   3. A TypeScript mirror of the engine as the last resort.
 *
 * The active source is exposed as a signal for the UI badge.
 */
@Injectable({ providedIn: 'root' })
export class MortgageService {
  /** Which engine produced the last result. */
  readonly source = signal<ComputeSource>('local');
  /** True once any Rust engine (wasm or HTTP) has responded. */
  readonly rustEngineActive = signal<boolean>(false);

  constructor(private readonly http: HttpClient) {
    // Warm the wasm module so the first calculation doesn't pay the fetch.
    void loadWasmEngine();
  }

  async calculate(input: MortgageInput): Promise<MortgageResult> {
    try {
      const result = await calculateWithWasm(input);
      this.source.set('wasm');
      this.rustEngineActive.set(true);
      return result;
    } catch {
      /* fall through to HTTP */
    }

    try {
      const result = await firstValueFrom(
        this.http.post<MortgageResult>('/api/calculate', input),
      );
      this.source.set('backend');
      this.rustEngineActive.set(true);
      return result;
    } catch {
      this.source.set('local');
      this.rustEngineActive.set(false);
      return calculateLocally(input);
    }
  }
}
