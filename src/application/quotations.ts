import { z } from 'zod';
import { exactDecimalSchema } from '../domain/decimals';
import { observationIdentity, observationInputSchema, quotationRecordSchema, quotationSelectorSchema, quotationFreshness, type MarketContext, type QuotationSelector } from '../domain/quotations';
import type { InstrumentRepository } from '../ports/instruments';
import type { QuotationRepository } from '../ports/quotations';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';

/** Server-side allowlist binding an ingestion principal to providers and instruments.
 * @remarks A permission to ingest quotes is insufficient unless all three grant fields match.
 */
export interface QuotationIngestionGrant { subject: string; provider: string; instrument_ids: readonly string[] }
function parse<T>(schema: z.ZodType<T>, input: unknown, status: 400 | 422 = 422): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationError(status, status === 400 ? 'invalid_request' : 'invalid_quotation',
    [...new Set(result.error.issues.map(issue => issue.path.join('.')).filter(Boolean))].slice(0, 20));
  return result.data;
}
const batch = z.object({ observations: z.array(observationInputSchema).min(1).max(50) }).strict();
export const quotationHistoryQuerySchema = quotationSelectorSchema.extend({
  from: z.string().datetime(), to: z.string().datetime(), limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(2048).optional(),
});
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Validates quote declarations, enforces ingestion grants, and serves quote reads. */
export class QuotationService {
  constructor(private readonly repository: QuotationRepository, private readonly instruments: InstrumentRepository,
    private readonly grants: readonly QuotationIngestionGrant[] = [],
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly market: (selector: QuotationSelector, now: string) => MarketContext = () => ({ phase: 'unknown', expected_session_date: null }),
    private readonly id: () => string = () => crypto.randomUUID()) {}

  /** Persists a bounded provider-observation batch.
   * @param principal - Authenticated machine principal requesting ingestion.
   * @param input - Observation batch; prices and quote units are checked against instrument metadata.
   * @param key - Stable idempotency key for retrying the same batch.
   * @returns Stored observations and their accepted count.
   * @throws {ApplicationError} If authorization, grants, validation, instrument identity, or timestamp checks fail.
   * @remarks Failed observations contain no invented price. A batch is bound to explicit subject/provider/instrument grants.
   */
  async ingest(principal: Principal | null, input: unknown, key: unknown) {
    requirePermission(principal, 'quotes:ingest');
    const idempotencyKey = parse(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), key, 400);
    const data = parse(batch, input);
    const now = this.clock();
    const allowed = (observation: typeof data.observations[number]) => this.grants.some(grant =>
      grant.subject === principal.subject && grant.provider === observation.provider && grant.instrument_ids.includes(observation.instrument_id));
    // Prefetch only authorized identities, deduplicated across observations.
    // Each observation still undergoes grant and instrument validation below.
    const ids = [...new Set(data.observations.filter(allowed).map(observation => observation.instrument_id))];
    const instruments = new Map((await this.instruments.getMany(ids)).map(instrument => [instrument.id, instrument]));
    const identities = new Set<string>();
    const records = [];
    for (const observation of data.observations) {
      if (!allowed(observation)) {
        throw new ApplicationError(403, 'quotation_ingestion_not_allowed');
      }
      const instrument = instruments.get(observation.instrument_id);
      if (!instrument) throw new ApplicationError(422, 'unknown_instrument');
      observation.fetched_at = new Date(observation.fetched_at).toISOString();
      if (observation.market_timestamp) observation.market_timestamp = new Date(observation.market_timestamp).toISOString();
      if (observation.fetched_at > now || observation.market_timestamp && observation.market_timestamp > observation.fetched_at) throw new ApplicationError(422, 'invalid_quotation_timestamps');
      if (observation.outcome === 'success' && (observation.currency !== instrument.quote_currency || observation.price_unit !== instrument.price_unit)) throw new ApplicationError(422, 'quotation_unit_mismatch');
      const identity = observationIdentity(observation);
      if (identities.has(identity)) throw new ApplicationError(422, 'duplicate_batch_observation');
      identities.add(identity);
      records.push(quotationRecordSchema.parse({ ...observation, id: this.id(), recorded_at: now,
        price: observation.price === null ? null : exactDecimalSchema(12).parse(observation.price), source_price: observation.price, value_origin: 'provider_declared' }));
    }
    records.sort((a, b) => observationIdentity(a) < observationIdentity(b) ? -1 : 1);
    const canonicalInput = JSON.stringify({ version: 1, observations: records.map(({ id, recorded_at, ...record }) => record) });
    const stored = await this.repository.append(records, { subject: principal.subject, key: idempotencyKey, canonicalInput });
    return { data: stored, accepted: stored.length };
  }

  /** Returns the current status for one explicitly selected quote stream.
   * @param principal - Authenticated caller with `quotes:read` permission.
   * @param input - Exact instrument, provider, price kind, and adjustment selector.
   * @returns Quote availability, latest attempt, trusted market context, and freshness assessment.
   * @throws {ApplicationError} If authorization, selector validation, or instrument lookup fails.
   */
  async status(principal: Principal | null, input: unknown) {
    const result = await this.statuses(principal, [input]);
    return result.data[0]!;
  }

  // One evaluation clock for a bounded portfolio read, not a cross-instrument
  // database snapshot. Trusted services call directly, never through HTTP.
  /** Evaluates a bounded set of quote selectors at one clock instant.
   * @param principal - Authenticated caller with `quotes:read` permission.
   * @param inputs - At most 100 explicit quote-stream selectors.
   * @returns All statuses with one shared evaluation timestamp.
   * @throws {ApplicationError} If authorization or any selector is invalid or references an absent instrument.
   * @remarks Each repository lookup is independent; the shared timestamp does not imply an atomic cross-instrument D1 snapshot.
   */
  async statuses(principal: Principal | null, inputs: readonly unknown[]) {
    requirePermission(principal, 'quotes:read');
    const queries = parse(z.array(quotationSelectorSchema).max(100), inputs, 400);
    const now = this.clock();
    const data = [];
    for (const query of queries) data.push(await this.statusAt(query, now));
    return { evaluated_at: now, data };
  }

  private async statusAt(query: QuotationSelector, now: string) {
    if (!await this.instruments.get(query.instrument_id)) throw new ApplicationError(404, 'instrument_not_found');
    const snapshot = await this.repository.snapshot(query);
    const marketContext = this.market(query, now);
    return { selector: query, quote: snapshot.quote,
      availability: snapshot.quote ? 'available' : snapshot.lastAttempt ? 'unavailable' : 'missing',
      last_attempt: snapshot.lastAttempt, last_successful_fetch_at: snapshot.lastSuccess?.fetched_at ?? null,
      market_context: marketContext, freshness: quotationFreshness(snapshot.quote, snapshot.lastSuccess, now, marketContext), evaluated_at: now };
  }

  /** Returns quote history for one explicit selector and bounded time window.
   * @param principal - Authenticated caller with `quotes:read` permission.
   * @param input - Selector, inclusive time bounds, page limit, and optional filter-bound cursor.
   * @returns Historical provider declarations and an optional continuation cursor.
   * @throws {ApplicationError} If authorization, time-window, cursor, or instrument validation fails.
   * @remarks History preserves provider observations; it does not fill gaps or synthesize prices.
   */
  async history(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'quotes:read');
    const query = parse(quotationHistoryQuerySchema, input, 400);
    query.from = new Date(query.from).toISOString(); query.to = new Date(query.to).toISOString();
    if (query.from > query.to || Date.parse(query.to) - Date.parse(query.from) > 366 * 86400000) throw new ApplicationError(400, 'invalid_quotation_window');
    if (!await this.instruments.get(query.instrument_id)) throw new ApplicationError(404, 'instrument_not_found');
    const { cursor, ...filters } = query;
    let after: { market_timestamp: string; fetched_at: string; id: string } | null = null;
    if (cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
        const decoded = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
        const value = z.object({ version: z.literal(1), filters: quotationHistoryQuerySchema.omit({ cursor: true, limit: true }),
          after: z.object({ market_timestamp: z.string().datetime(), fetched_at: z.string().datetime(), id: quotationRecordSchema.shape.id }).strict() }).strict().parse(decoded);
        const { limit, ...binding } = filters;
        if (JSON.stringify(value.filters) !== JSON.stringify(binding) || encode(value) !== cursor) throw new Error();
        after = value.after;
      } catch { throw new ApplicationError(400, 'invalid_cursor'); }
    }
    const records = await this.repository.list({ ...filters, limit: query.limit + 1, after });
    const data = records.slice(0, query.limit);
    const last = data.at(-1);
    const { limit, ...binding } = filters;
    return { data, page: { next_cursor: records.length > query.limit && last ? encode({ version: 1, filters: binding,
      after: { market_timestamp: last.market_timestamp, fetched_at: last.fetched_at, id: last.id } }) : null } };
  }
}
