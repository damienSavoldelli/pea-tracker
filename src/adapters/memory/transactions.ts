import type { JournalBalances, TransactionEvent, TransactionOutcome } from '../../domain/transactions';
import type { TransactionRepository, TransactionReplay } from '../../ports/transactions';
import { ApplicationError } from '../../application/errors';

/** Local-only adapter: detached snapshots and synchronous atomic compare/append, no production binding. */
export class MemoryTransactionRepository implements TransactionRepository {
  private readonly streams = new Map<string, { events: TransactionEvent[]; balances: JournalBalances }>();
  private readonly outcomes = new Map<string, { canonical: string; outcome: TransactionOutcome }>();
  private key(portfolioId: string, replay: TransactionReplay) {
    return JSON.stringify([portfolioId, replay.subject, 'appendTransaction', replay.key]);
  }
  async get(portfolioId: string) {
    return structuredClone(this.streams.get(portfolioId) ?? { events: [], balances: null });
  }
  async replay(portfolioId: string, replay: TransactionReplay) {
    const prior = this.outcomes.get(this.key(portfolioId, replay));
    if (!prior) return null;
    if (prior.canonical !== replay.canonical_input) throw new ApplicationError(409, 'idempotency_conflict');
    return structuredClone(prior.outcome);
  }
  async append(portfolioId: string, expected: number, outcome: TransactionOutcome, replay: TransactionReplay) {
    // No await between the replay check, CAS and mutation: one atomic in-process operation.
    const key = this.key(portfolioId, replay);
    const prior = this.outcomes.get(key);
    if (prior) {
      if (prior.canonical !== replay.canonical_input) throw new ApplicationError(409, 'idempotency_conflict');
      return structuredClone(prior.outcome);
    }
    const stream = this.streams.get(portfolioId);
    if ((stream?.events.length ?? 0) !== expected) throw new ApplicationError(412, 'version_mismatch');
    if (expected >= 1000) throw new ApplicationError(409, 'journal_capacity_exceeded');
    if (stream?.events.some(event => event.id === outcome.event.id)) throw new ApplicationError(409, 'duplicate_transaction_id');
    if (outcome.event.portfolio_id !== portfolioId || outcome.balances.portfolio_id !== portfolioId ||
        outcome.event.sequence !== expected + 1 || outcome.balances.version !== expected + 1) {
      throw new ApplicationError(409, 'invalid_journal_append');
    }
    const stored = structuredClone(outcome);
    this.streams.set(portfolioId, { events: [...(stream?.events ?? []), stored.event], balances: stored.balances });
    this.outcomes.set(key, { canonical: replay.canonical_input, outcome: stored });
    return structuredClone(stored);
  }
}
