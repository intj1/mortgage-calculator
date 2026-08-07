import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { MortgageInput, MortgageResult } from '../models/mortgage.models';
import { calculateLocally } from './local-engine';

/** Where the computation came from, surfaced in the UI. */
export type ComputeSource = 'backend' | 'local';

/**
 * Talks to the Rust API (`POST /api/calculate`). If the backend is unreachable
 * it transparently falls back to the local TypeScript engine so the app always
 * produces a result. The active source is exposed as a signal for the UI.
 */
@Injectable({ providedIn: 'root' })
export class MortgageService {
  /** Reflects whether the last calculation used the backend or the local engine. */
  readonly source = signal<ComputeSource>('backend');
  /** True once we have confirmed the backend is reachable at least once. */
  readonly backendOnline = signal<boolean>(false);

  constructor(private readonly http: HttpClient) {
    this.pingBackend();
  }

  private async pingBackend(): Promise<void> {
    try {
      await firstValueFrom(this.http.get('/api/health'));
      this.backendOnline.set(true);
    } catch {
      this.backendOnline.set(false);
    }
  }

  async calculate(input: MortgageInput): Promise<MortgageResult> {
    try {
      const result = await firstValueFrom(
        this.http.post<MortgageResult>('/api/calculate', input),
      );
      this.source.set('backend');
      this.backendOnline.set(true);
      return result;
    } catch {
      // Backend down or returned an error; compute locally instead.
      this.source.set('local');
      this.backendOnline.set(false);
      return calculateLocally(input);
    }
  }
}
