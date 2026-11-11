import type { QuotationRecord, QuotationSelector } from '../domain/quotations';

export interface QuotationWindow extends QuotationSelector {
  from: string; to: string; limit: number;
  after: { market_timestamp: string; fetched_at: string; id: string } | null;
}
export interface QuotationSnapshot {
  quote: QuotationRecord | null; lastAttempt: QuotationRecord | null; lastSuccess: QuotationRecord | null;
}
export interface QuotationReplay { subject: string; key: string; canonicalInput: string }
export interface QuotationRepository {
  // Validated immutable records; natural identity = selector + fetched_at.
  // Exact duplicate observations reuse original records; conflicting declarations
  // under that identity ->409. Entire batch + original receipt commit atomically.
  append(records: QuotationRecord[], replay: QuotationReplay): Promise<QuotationRecord[]>;
  snapshot(query: QuotationSelector): Promise<QuotationSnapshot>;
  list(query: QuotationWindow): Promise<QuotationRecord[]>;
}
