import { ApplicationError } from '../../application/errors';
import { createInstrumentSchema, instrumentSchema, type Instrument, type UpdateInstrument } from '../../domain/instruments';
import type { CreateReplay, InstrumentRepository, RepositoryPage } from '../../ports/instruments';

const columns = 'id,name,kind,isin,quote_currency,price_unit,exchange_mic,provider_symbol,active,version,created_at,updated_at';
const receiptPredicate = 'subject = ? AND operation = ? AND idempotency_key = ?';
const operation = 'createInstrument';

async function storage<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new Error('Instrument storage operation failed');
  }
}

function decode(row: Record<string, unknown>): Instrument {
  if (row.active !== 0 && row.active !== 1) throw new Error('Invalid instrument storage');
  const parsed = instrumentSchema.safeParse({ ...row, active: row.active === 1 });
  if (!parsed.success) throw new Error('Invalid instrument storage');
  return parsed.data;
}

// SQL and storage metadata stay in this adapter. Native D1 batch provides the
// transaction boundary; there is no preflight read or process-local lock.
export class D1InstrumentRepository implements InstrumentRepository {
  constructor(private readonly db: D1Database) {}

  async get(id: string): Promise<Instrument | null> {
    return storage(async () => {
      const row = await this.db.prepare(`SELECT ${columns} FROM instruments WHERE id = ?`).bind(id).first<Record<string, unknown>>();
      return row ? decode(row) : null;
    });
  }

  async list(query: RepositoryPage): Promise<Instrument[]> {
    return storage(async () => {
      const conditions: string[] = [];
      const bindings: (string | number)[] = [];
      if (query.active !== null) { conditions.push('active = ?'); bindings.push(Number(query.active)); }
      if (query.after !== null) { conditions.push('id > ?'); bindings.push(query.after); }
      bindings.push(query.limit);
      const result = await this.db.prepare(`SELECT ${columns} FROM instruments${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY id COLLATE BINARY ASC LIMIT ?`).bind(...bindings).all<Record<string, unknown>>();
      return result.results.map(decode);
    });
  }

  async getMany(ids: readonly string[]): Promise<Instrument[]> {
    const unique = [...new Set(ids)];
    if (unique.length > 50) throw new Error('Instrument lookup limit exceeded');
    if (!unique.length) return [];
    return storage(async () => {
      const rows = await this.db.prepare(`SELECT ${columns} FROM instruments WHERE id IN (${unique.map(() => '?').join(',')})`)
        .bind(...unique).all<Record<string, unknown>>();
      return rows.results.map(decode);
    });
  }

  async create(record: Instrument, replay: CreateReplay): Promise<Instrument> {
    const key = [replay.subject, operation, replay.key];
    let results: D1Result<Record<string, unknown>>[];
    try {
      results = await this.db.batch<Record<string, unknown>>([
        this.db.prepare(`INSERT INTO instruments (${columns}) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM instrument_create_outcomes WHERE ${receiptPredicate})`)
          .bind(record.id, record.name, record.kind, record.isin, record.quote_currency, record.price_unit, record.exchange_mic, record.provider_symbol, Number(record.active), record.version, record.created_at, record.updated_at, ...key),
        this.db.prepare(`INSERT INTO instrument_create_outcomes (subject,operation,idempotency_key,canonical_version,canonical_input,instrument_id,original_instrument_json,recorded_at) SELECT ?,?,?,1,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM instrument_create_outcomes WHERE ${receiptPredicate})`)
          .bind(...key, replay.canonicalInput, record.id, JSON.stringify(record), record.created_at, ...key),
        this.db.prepare(`SELECT canonical_version,canonical_input,instrument_id,original_instrument_json FROM instrument_create_outcomes WHERE ${receiptPredicate}`).bind(...key),
      ]);
    } catch (error) {
      // Only this proven native constraint is a domain conflict. Never expose SQL,
      // bound values or unknown storage errors as a duplicate-identity response.
      if (error instanceof Error && /UNIQUE constraint failed: instruments\.isin(?:\b|$)/.test(error.message)) {
        throw new ApplicationError(409, 'duplicate_isin');
      }
      throw new Error('Instrument storage operation failed');
    }
    const receipt = results[2]?.results[0];
    if (!receipt || receipt.canonical_version !== 1 || typeof receipt.canonical_input !== 'string' || typeof receipt.original_instrument_json !== 'string') {
      throw new Error('Invalid instrument outcome storage');
    }
    let snapshot: Instrument;
    try { snapshot = instrumentSchema.parse(JSON.parse(receipt.original_instrument_json)); }
    catch { throw new Error('Invalid instrument outcome storage'); }
    if (snapshot.id !== receipt.instrument_id || snapshot.version !== 1 || snapshot.created_at !== snapshot.updated_at) throw new Error('Invalid instrument outcome storage');
    const { id, version, created_at, updated_at, ...metadata } = snapshot;
    if (JSON.stringify(createInstrumentSchema.parse(metadata)) !== receipt.canonical_input) throw new Error('Invalid instrument outcome storage');
    if (receipt.canonical_input !== replay.canonicalInput) throw new ApplicationError(409, 'idempotency_conflict');
    return snapshot;
  }

  async update(id: string, version: number, patch: UpdateInstrument, updatedAt: string): Promise<Instrument> {
    return storage(async () => {
      const results = await this.db.batch<Record<string, unknown>>([
        this.db.prepare('UPDATE instruments SET name = COALESCE(?,name), active = COALESCE(?,active), updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND version < 9007199254740991')
          .bind(patch.name ?? null, patch.active === undefined ? null : Number(patch.active), updatedAt, id, version),
        this.db.prepare(`SELECT ${columns} FROM instruments WHERE id = ?`).bind(id),
      ]);
      const row = results[1]?.results[0];
      const changes = results[0]?.meta.changes;
      // A zero-row UPDATE succeeds in SQLite. Its sole dependent statement is a
      // read: conflict classification cannot commit a receipt or other side effect.
      if (changes === 0) {
        if (!row) throw new ApplicationError(404, 'instrument_not_found');
        const current = decode(row);
        if (current.version !== version) throw new ApplicationError(412, 'version_mismatch');
        if (current.version === Number.MAX_SAFE_INTEGER) throw new ApplicationError(409, 'version_exhausted');
      }
      if (changes !== 1 || !row) throw new Error('Invalid instrument update result');
      return decode(row);
    });
  }
}
