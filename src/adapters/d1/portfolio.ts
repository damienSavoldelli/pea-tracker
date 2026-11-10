import { openingStateSchema, type OpeningState } from '../../domain/portfolio';
import type { PortfolioRepository, OpeningReplay } from '../../ports/portfolio';
import { ApplicationError } from '../../application/errors';

function decode(payload: unknown): OpeningState {
  try { return openingStateSchema.parse(JSON.parse(String(payload))); }
  catch { throw new Error('Invalid opening state storage'); }
}
export class D1PortfolioRepository implements PortfolioRepository {
  constructor(private readonly db: D1Database) {}
  async get(revision?: number) {
    try {
      const row = revision === undefined
        ? await this.db.prepare('SELECT payload_json FROM opening_revisions ORDER BY revision DESC LIMIT 1').first<{ payload_json: string }>()
        : await this.db.prepare('SELECT payload_json FROM opening_revisions WHERE revision = ?').bind(revision).first<{ payload_json: string }>();
      return row ? decode(row.payload_json) : null;
    } catch { throw new Error('Opening state storage operation failed'); }
  }
  async append(state: OpeningState, expected: number, replay: OpeningReplay) {
    if (state.revision !== expected + 1) throw new ApplicationError(412, 'version_mismatch');
    const guard = 'NOT EXISTS (SELECT 1 FROM opening_outcomes WHERE subject = ? AND idempotency_key = ?)';
    let results: D1Result<Record<string, unknown>>[];
    try {
      // All dependent writes are guarded by this invocation's revision ID AND
      // absent receipt. A skipped replay INSERT cannot append lines or outcomes.
      // CAS failure is a SQL trigger error (not a zero-row UPDATE), rolling back
      // the whole native D1 batch, including positions and the durable receipt.
      results = await this.db.batch<Record<string, unknown>>([
        this.db.prepare(`INSERT INTO opening_revisions (revision,id,effective_at,recorded_at,correction_reason,payload_json)
          SELECT ?,?,?,?,?,? WHERE ${guard}`)
          .bind(state.revision, state.id, state.effective_at, state.recorded_at, state.correction_reason, JSON.stringify(state), replay.subject, replay.key),
        this.db.prepare(`INSERT INTO opening_positions (revision,instrument_id,quantity,declared_pru,currency,provenance_json)
          SELECT r.revision,json_extract(p.value,'$.instrument_id'),json_extract(p.value,'$.quantity'),
            json_extract(p.value,'$.declared_pru'),json_extract(p.value,'$.currency'),json_extract(p.value,'$.provenance')
          FROM opening_revisions r,json_each(r.payload_json,'$.positions') p WHERE r.id = ? AND ${guard}`)
          .bind(state.id, replay.subject, replay.key),
        this.db.prepare(`INSERT INTO opening_outcomes (subject,idempotency_key,canonical_input,revision)
          SELECT ?,?,?,revision FROM opening_revisions WHERE id = ? AND ${guard}`)
          .bind(replay.subject, replay.key, replay.canonicalInput, state.id, replay.subject, replay.key),
        this.db.prepare(`SELECT o.canonical_input,r.payload_json FROM opening_outcomes o
          JOIN opening_revisions r ON r.revision = o.revision WHERE o.subject = ? AND o.idempotency_key = ?`)
          .bind(replay.subject, replay.key),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('opening_revision_conflict')) throw new ApplicationError(412, 'version_mismatch');
      if (message.includes('opening_date_immutable')) throw new ApplicationError(409, 'opening_date_immutable');
      if (message.includes('FOREIGN KEY constraint failed')) throw new ApplicationError(422, 'unknown_instrument');
      throw new Error('Opening state storage operation failed');
    }
    const row = results[3]?.results[0];
    if (!row) throw new Error('Missing opening state outcome');
    if (row.canonical_input !== replay.canonicalInput) throw new ApplicationError(409, 'idempotency_conflict');
    return decode(row.payload_json);
  }
}
