import type { OpeningState } from '../domain/portfolio';

export interface OpeningReplay { subject: string; key: string; canonicalInput: string }
export interface PortfolioRepository {
  get(revision?: number): Promise<OpeningState | null>;
  // Atomic immutable append + durable original outcome. Replay precedes CAS;
  // expected=0 creates; corrections preserve effective_at and require a reason.
  // Stale version ->412; changed replay input ->409; missing instrument ->422.
  append(state: OpeningState, expected: number, replay: OpeningReplay): Promise<OpeningState>;
}
