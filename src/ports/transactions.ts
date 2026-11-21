import type { JournalBalances, TransactionEvent, TransactionOutcome } from '../domain/transactions';

export interface TransactionReplay { subject: string; key: string; canonical_input: string }
/** Atomic append, original-outcome replay and optimistic concurrency are scoped to portfolio + actor. */
export interface TransactionRepository {
  get(portfolioId: string): Promise<{ events: TransactionEvent[]; balances: JournalBalances | null }>;
  replay(portfolioId: string, replay: TransactionReplay): Promise<TransactionOutcome | null>;
  append(portfolioId: string, expected: number, outcome: TransactionOutcome, replay: TransactionReplay): Promise<TransactionOutcome>;
}
