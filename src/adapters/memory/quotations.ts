import { observationDeclaration, observationIdentity, selectorMatches, type QuotationRecord, type QuotationSelector } from '../../domain/quotations';
import type { QuotationRepository, QuotationReplay, QuotationWindow } from '../../ports/quotations';
import { ApplicationError } from '../../application/errors';

const ascending = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const chronological = (a: QuotationRecord, b: QuotationRecord) => ascending(a.market_timestamp ?? '', b.market_timestamp ?? '') || ascending(a.fetched_at, b.fetched_at) || ascending(a.id, b.id);
export class MemoryQuotationRepository implements QuotationRepository {
  private readonly records = new Map<string, QuotationRecord>();
  private readonly outcomes = new Map<string, { input: string; records: QuotationRecord[] }>();
  async append(records: QuotationRecord[], replay: QuotationReplay) {
    const key = JSON.stringify([replay.subject, 'ingestQuotations', replay.key]);
    const prior = this.outcomes.get(key);
    if (prior) {
      if (prior.input !== replay.canonicalInput) throw new ApplicationError(409, 'idempotency_conflict');
      return structuredClone(prior.records);
    }
    const resolved = records.map(record => {
      const existing = this.records.get(observationIdentity(record));
      if (existing && observationDeclaration(existing) !== observationDeclaration(record)) throw new ApplicationError(409, 'quotation_observation_conflict');
      return structuredClone(existing ?? record);
    });
    // Validate the entire batch before a synchronous, await-free commit.
    for (const record of resolved) this.records.set(observationIdentity(record), record);
    this.outcomes.set(key, { input: replay.canonicalInput, records: structuredClone(resolved) });
    return structuredClone(resolved);
  }
  async snapshot(query: QuotationSelector) {
    const records = [...this.records.values()].filter(record => selectorMatches(record, query));
    const byFetch = [...records].sort((a, b) => ascending(a.fetched_at, b.fetched_at));
    const success = records.filter(record => record.outcome === 'success');
    return structuredClone({ quote: success.sort(chronological).at(-1) ?? null,
      lastAttempt: byFetch.at(-1) ?? null, lastSuccess: byFetch.filter(record => record.outcome === 'success').at(-1) ?? null });
  }
  async list(query: QuotationWindow) {
    return structuredClone([...this.records.values()].filter(record => selectorMatches(record, query) && record.outcome === 'success'
      && record.market_timestamp! >= query.from && record.market_timestamp! <= query.to
      && (!query.after || chronological(record, { ...record, ...query.after }) > 0)).sort(chronological).slice(0, query.limit));
  }
}
