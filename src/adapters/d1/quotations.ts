import { observationDeclaration, quotationRecordSchema, type QuotationRecord, type QuotationSelector } from '../../domain/quotations';
import type { QuotationRepository, QuotationReplay, QuotationWindow } from '../../ports/quotations';
import { ApplicationError } from '../../application/errors';

const predicate = 'instrument_id = ? AND provider = ? AND price_kind = ? AND adjustment = ?';
const bindSelector = (query: QuotationSelector) => [query.instrument_id, query.provider, query.price_kind, query.adjustment];
function decode(row: Record<string, unknown>): QuotationRecord {
  try { return quotationRecordSchema.parse(JSON.parse(String(row.record_json))); }
  catch { throw new Error('Invalid quotation storage'); }
}
export class D1QuotationRepository implements QuotationRepository {
  constructor(private readonly db: D1Database) {}
  async append(records: QuotationRecord[], replay: QuotationReplay) {
    const receipt = 'NOT EXISTS (SELECT 1 FROM quotation_batch_outcomes WHERE subject = ? AND idempotency_key = ?)';
    const input = JSON.stringify(records.map(record => ({ ...record, declaration_json: observationDeclaration(record) })));
    let results: D1Result<Record<string, unknown>>[];
    try {
      results = await this.db.batch<Record<string, unknown>>([
        this.db.prepare(`INSERT INTO quotation_observations
          (id,instrument_id,provider,price_kind,adjustment,fetched_at,market_timestamp,outcome,price,declaration_json,record_json)
          SELECT json_extract(p.value,'$.id'),json_extract(p.value,'$.instrument_id'),json_extract(p.value,'$.provider'),
            json_extract(p.value,'$.price_kind'),json_extract(p.value,'$.adjustment'),json_extract(p.value,'$.fetched_at'),
            json_extract(p.value,'$.market_timestamp'),json_extract(p.value,'$.outcome'),json_extract(p.value,'$.price'),
            json_extract(p.value,'$.declaration_json'),json_remove(p.value,'$.declaration_json')
          FROM json_each(?) p WHERE ${receipt}
          ON CONFLICT (instrument_id,provider,price_kind,adjustment,fetched_at) DO NOTHING`)
          .bind(input, replay.subject, replay.key),
        this.db.prepare(`INSERT INTO quotation_batch_outcomes (subject,idempotency_key,canonical_input,original_outcome_json)
          SELECT ?,?,?,(SELECT json_group_array(json(record_json)) FROM (
            SELECT q.record_json FROM json_each(?) p JOIN quotation_observations q
              ON q.instrument_id = json_extract(p.value,'$.instrument_id') AND q.provider = json_extract(p.value,'$.provider')
              AND q.price_kind = json_extract(p.value,'$.price_kind') AND q.adjustment = json_extract(p.value,'$.adjustment')
              AND q.fetched_at = json_extract(p.value,'$.fetched_at') ORDER BY p.key
          )) WHERE ${receipt}`)
          .bind(replay.subject, replay.key, replay.canonicalInput, input, replay.subject, replay.key),
        this.db.prepare('SELECT canonical_input,original_outcome_json FROM quotation_batch_outcomes WHERE subject = ? AND idempotency_key = ?').bind(replay.subject, replay.key),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('quotation_observation_conflict')) throw new ApplicationError(409, 'quotation_observation_conflict');
      if (message.includes('FOREIGN KEY constraint failed')) throw new ApplicationError(422, 'unknown_instrument');
      throw new Error('Quotation storage operation failed');
    }
    const outcome = results[2]?.results[0];
    if (!outcome) throw new Error('Missing quotation outcome');
    if (outcome.canonical_input !== replay.canonicalInput) throw new ApplicationError(409, 'idempotency_conflict');
    try {
      const parsed: unknown = JSON.parse(String(outcome.original_outcome_json));
      if (!Array.isArray(parsed) || parsed.length !== records.length) throw new Error();
      return parsed.map(record => quotationRecordSchema.parse(record));
    } catch { throw new Error('Invalid quotation outcome storage'); }
  }
  async snapshot(query: QuotationSelector) {
    try {
      const args = bindSelector(query);
      const results = await this.db.batch<Record<string, unknown>>([
        this.db.prepare(`SELECT record_json FROM quotation_observations WHERE ${predicate} AND outcome = 'success' ORDER BY market_timestamp DESC,fetched_at DESC,id DESC LIMIT 1`).bind(...args),
        this.db.prepare(`SELECT record_json FROM quotation_observations WHERE ${predicate} ORDER BY fetched_at DESC LIMIT 1`).bind(...args),
        this.db.prepare(`SELECT record_json FROM quotation_observations WHERE ${predicate} AND outcome = 'success' ORDER BY fetched_at DESC LIMIT 1`).bind(...args),
      ]);
      const get = (index: number) => results[index]?.results[0] ? decode(results[index]!.results[0]!) : null;
      return { quote: get(0), lastAttempt: get(1), lastSuccess: get(2) };
    } catch { throw new Error('Quotation storage operation failed'); }
  }
  async list(query: QuotationWindow) {
    try {
      const after = query.after;
      const rows = await this.db.prepare(`SELECT record_json FROM quotation_observations WHERE ${predicate} AND outcome = 'success'
        AND market_timestamp >= ? AND market_timestamp <= ?
        ${after ? 'AND (market_timestamp,fetched_at,id) > (?,?,?)' : ''}
        ORDER BY market_timestamp,fetched_at,id LIMIT ?`)
        .bind(...bindSelector(query), query.from, query.to, ...(after ? [after.market_timestamp, after.fetched_at, after.id] : []), query.limit)
        .all<Record<string, unknown>>();
      return rows.results.map(decode);
    } catch { throw new Error('Quotation storage operation failed'); }
  }
}
