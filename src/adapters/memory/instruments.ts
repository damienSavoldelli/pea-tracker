import { ApplicationError } from '../../application/errors';
import type { Instrument } from '../../domain/instruments';
import type { CreateReplay, InstrumentRepository, RepositoryPage } from '../../ports/instruments';

export class MemoryInstrumentRepository implements InstrumentRepository {
  private readonly records = new Map<string, Instrument>();
  private readonly outcomes = new Map<string, { input: string; record: Instrument }>();

  async get(id: string) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async list(query: RepositoryPage) {
    return [...this.records.values()]
      .filter(record => (query.active === null || record.active === query.active) && (query.after === null || record.id > query.after))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      .slice(0, query.limit).map(record => structuredClone(record));
  }

  async create(record: Instrument, replay: CreateReplay) {
    // No await inside the critical section: checks, record and replay outcome form
    // a single synchronous mutation within this instance, not a distributed lock.
    const key = JSON.stringify([replay.subject, 'createInstrument', replay.key]);
    const prior = this.outcomes.get(key);
    if (prior) {
      if (prior.input !== replay.canonicalInput) throw new ApplicationError(409, 'idempotency_conflict');
      return structuredClone(prior.record);
    }
    if (record.isin !== null && [...this.records.values()].some(item => item.isin === record.isin)) {
      throw new ApplicationError(409, 'duplicate_isin');
    }
    if (this.records.has(record.id)) throw new Error('ID generator collision');
    const stored = structuredClone(record);
    this.records.set(stored.id, stored);
    this.outcomes.set(key, { input: replay.canonicalInput, record: structuredClone(stored) });
    return structuredClone(stored);
  }

  async update(id: string, version: number, patch: Parameters<InstrumentRepository['update']>[2], updatedAt: string) {
    const prior = this.records.get(id);
    if (!prior) throw new ApplicationError(404, 'instrument_not_found');
    if (prior.version !== version) throw new ApplicationError(412, 'version_mismatch');
    if (prior.version === Number.MAX_SAFE_INTEGER) throw new ApplicationError(409, 'version_exhausted');
    const next = { ...prior, name: patch.name ?? prior.name, active: patch.active ?? prior.active, version: prior.version + 1, updated_at: updatedAt };
    this.records.set(id, structuredClone(next));
    return structuredClone(next);
  }
}
