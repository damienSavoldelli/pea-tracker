import { transactionOutcomeSchema, type TransactionOutcome } from '../../domain/transactions';
import type { TransactionReplay, TransactionRepository } from '../../ports/transactions';
import { ApplicationError } from '../../application/errors';

interface OutcomeRow { event_json: string; balances_json: string; canonical_input?: string }
const receipt = `SELECT o.canonical_input,e.event_json,e.balances_json FROM transaction_outcomes o
  JOIN transaction_events e ON e.portfolio_id=o.portfolio_id AND e.sequence=o.sequence
  WHERE o.portfolio_id=? AND o.subject=? AND o.idempotency_key=?`;
function decode(row: OutcomeRow) {
  return transactionOutcomeSchema.parse({ event: JSON.parse(row.event_json), balances: JSON.parse(row.balances_json) });
}
function replayed(row: OutcomeRow | null | undefined, replay: TransactionReplay) {
  if (!row) return null;
  if (row.canonical_input !== replay.canonical_input) throw new ApplicationError(409, 'idempotency_conflict');
  return decode(row);
}

/** Optional durable adapter; no deployed composition imports this module or applies its migration. */
export class D1TransactionRepository implements TransactionRepository {
  constructor(private readonly db: D1Database) {}
  async get(portfolioId: string) {
    const rows = await this.db.prepare(`SELECT event_json,balances_json FROM transaction_events
      WHERE portfolio_id=? ORDER BY sequence LIMIT 1000`).bind(portfolioId).all<OutcomeRow>();
    const outcomes = rows.results.map(decode);
    return { events: outcomes.map(outcome => outcome.event), balances: outcomes.at(-1)?.balances ?? null };
  }
  async replay(portfolioId: string, replay: TransactionReplay) {
    return replayed(await this.db.prepare(receipt).bind(portfolioId, replay.subject, replay.key).first<OutcomeRow>(), replay);
  }
  async append(portfolioId: string, expected: number, outcome: TransactionOutcome, replay: TransactionReplay) {
    const parsed = transactionOutcomeSchema.parse(outcome);
    if (parsed.event.portfolio_id !== portfolioId || parsed.event.sequence !== expected + 1) throw new ApplicationError(412, 'version_mismatch');
    const guard = 'NOT EXISTS (SELECT 1 FROM transaction_outcomes WHERE portfolio_id=? AND subject=? AND idempotency_key=?)';
    const balances = parsed.balances;
    let results: D1Result<OutcomeRow>[];
    try {
      // D1 batch is atomic. The event trigger performs CAS and advances the journal;
      // a failed concurrent append rolls back its event and receipt together.
      results = await this.db.batch<OutcomeRow>([
        this.db.prepare(`INSERT OR IGNORE INTO transaction_journals
          (portfolio_id,kind,owner_subject,opening_id,opening_revision,version) VALUES (?,?,?,?,?,0)`)
          .bind(portfolioId, balances.kind, replay.subject, balances.opening_id, balances.opening_revision),
        this.db.prepare(`INSERT INTO transaction_events (id,portfolio_id,sequence,instrument_id,reversal_of,event_json,balances_json)
          SELECT ?,?,?,?,?,?,? WHERE ${guard}`)
          .bind(parsed.event.id, portfolioId, parsed.event.sequence, parsed.event.instrument_id,
            parsed.event.input.type === 'reversal' ? parsed.event.input.reversal_of : null,
            JSON.stringify(parsed.event), JSON.stringify(balances), portfolioId, replay.subject, replay.key),
        this.db.prepare(`INSERT INTO transaction_outcomes (portfolio_id,subject,idempotency_key,canonical_input,sequence)
          SELECT ?,?,?,?,sequence FROM transaction_events WHERE id=? AND portfolio_id=? AND ${guard}`)
          .bind(portfolioId, replay.subject, replay.key, replay.canonical_input, parsed.event.id, portfolioId,
            portfolioId, replay.subject, replay.key),
        this.db.prepare(receipt).bind(portfolioId, replay.subject, replay.key),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('portfolio_write_denied')) throw new ApplicationError(403, 'portfolio_write_denied');
      if (message.includes('transaction_version_conflict')) throw new ApplicationError(412, 'version_mismatch');
      if (message.includes('opening_anchor_mismatch')) throw new ApplicationError(409, 'opening_anchor_mismatch');
      if (message.includes('transaction_events.id')) throw new ApplicationError(409, 'duplicate_transaction_id');
      if (message.includes('transaction_events.portfolio_id, transaction_events.reversal_of')) throw new ApplicationError(409, 'transaction_already_reversed');
      throw new Error('Transaction storage operation failed');
    }
    const result = replayed(results[3]?.results[0], replay);
    if (!result) throw new Error('Missing transaction outcome');
    return result;
  }
}
