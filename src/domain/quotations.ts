import { z } from 'zod';
import { exactDecimalSchema } from './decimals';
import { instrumentIdSchema } from './instruments';
import { provenanceSchema } from './portfolio';

/** Selects one provider's unadjusted quote type for one instrument.
 * @remarks Provider and quote kind are explicit; this selector does not authorize automatic fallback.
 */
export const quotationSelectorSchema = z.object({
  instrument_id: instrumentIdSchema,
  provider: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
  price_kind: z.enum(['last_trade', 'session_close']),
  adjustment: z.literal('unadjusted'),
}).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const price = z.string().max(64).refine(value => {
  const parsed = exactDecimalSchema(12).safeParse(value);
  return parsed.success && parsed.data !== '0' && !parsed.data.startsWith('-');
}, 'Expected a positive exact decimal price');
export const observationInputSchema = quotationSelectorSchema.extend({
  fetched_at: z.string().datetime(),
  outcome: z.enum(['success', 'unavailable']),
  price: price.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  price_unit: z.enum(['currency_unit', 'hundredth_currency_unit']).nullable(),
  market_timestamp: z.string().datetime().nullable(),
  session_date: date.nullable(),
  provider_delay_seconds: z.number().int().min(0).max(86400).nullable(),
  error_code: z.enum(['provider_unavailable', 'rate_limited', 'invalid_provider_data']).nullable(),
  provenance: provenanceSchema,
}).strict().superRefine((value, context) => {
  const required = ['price', 'currency', 'price_unit', 'market_timestamp', 'session_date'] as const;
  if (value.outcome === 'success') {
    for (const key of required) if (value[key] === null) context.addIssue({ code: 'custom', path: [key], message: 'Required for successful observation' });
    if (value.error_code !== null) context.addIssue({ code: 'custom', path: ['error_code'], message: 'Success cannot report failure' });
  } else {
    for (const key of [...required, 'provider_delay_seconds'] as const) if (value[key] !== null) context.addIssue({ code: 'custom', path: [key], message: 'Unavailable observation cannot invent quote values' });
    if (value.error_code === null) context.addIssue({ code: 'custom', path: ['error_code'], message: 'Failure reason required' });
  }
});
/** Stored provider declaration, retaining source precision and record provenance.
 * @remarks An unavailable outcome carries no price, currency, unit, or market timestamp.
 */
export const quotationRecordSchema = observationInputSchema.safeExtend({
  id: instrumentIdSchema, recorded_at: z.string().datetime(), source_price: price.nullable(),
  value_origin: z.literal('provider_declared'),
});
export type QuotationSelector = z.output<typeof quotationSelectorSchema>;
export type ObservationInput = z.output<typeof observationInputSchema>;
export type QuotationRecord = z.output<typeof quotationRecordSchema>;

/** Stable identity used to reject duplicate observations and bind idempotent batches.
 * @param record - Provider observation whose instrument, selector, and fetch time define identity.
 * @returns A deterministic serialization of the identity fields.
 */
export function observationIdentity(record: ObservationInput): string {
  return JSON.stringify([record.instrument_id, record.provider, record.price_kind, record.adjustment, record.fetched_at]);
}
/** Removes server-owned identity and recording time to compare replay declarations.
 * @param record - Persisted observation being normalized for replay comparison.
 * @returns A deterministic serialization of the provider-declared fields.
 */
export function observationDeclaration(record: QuotationRecord) {
  const { id, recorded_at, ...declaration } = record;
  return JSON.stringify(declaration);
}
/** Matches an observation to an exact provider, price kind, adjustment, and instrument.
 * @param record - Selector attached to the stored observation.
 * @param query - Requested selector; all fields must match exactly.
 * @returns Whether both selectors identify the same quote stream.
 */
export function selectorMatches(record: QuotationSelector, query: QuotationSelector) {
  return record.instrument_id === query.instrument_id && record.provider === query.provider && record.price_kind === query.price_kind && record.adjustment === query.adjustment;
}

// A trusted server-side calendar adapter supplies context. No HTTP query/header
// may declare an open market or a completed session. Unknown is fail-explicit.
/** Trusted market-session context; unknown calendars must remain explicit.
 * @remarks Callers derive this context from a trusted calendar, never from request data.
 */
export interface MarketContext { phase: 'open' | 'closed' | 'unknown'; expected_session_date: string | null }

/** Classifies quote availability and freshness without asserting real-time accuracy.
 * @param quote - Most recent usable provider-declared quote, if one exists.
 * @param successfulFetch - Latest successful retrieval used to measure collection age.
 * @param now - Single evaluation timestamp in ISO format.
 * @param context - Trusted session state and expected market date.
 * @returns Freshness classification, reason, ages, and provider-delay metadata.
 * @remarks Unknown calendar context stays unknown; freshness never guarantees a real-time price.
 */
export function quotationFreshness(quote: QuotationRecord | null, successfulFetch: QuotationRecord | null, now: string, context: MarketContext) {
  const age = (timestamp: string | null | undefined) => timestamp && timestamp <= now ? Math.floor((Date.parse(now) - Date.parse(timestamp)) / 1000) : null;
  const collectionAge = age(successfulFetch?.fetched_at);
  const marketAge = age(quote?.market_timestamp);
  let status: 'unavailable' | 'unknown' | 'within_target' | 'warning' | 'stale' | 'last_completed_session' = 'unavailable';
  let reason = 'no_successful_observation';
  if (quote) {
    if (quote.fetched_at > now || (successfulFetch && successfulFetch.fetched_at > now) || (quote.market_timestamp && quote.market_timestamp > now)) { status = 'unknown'; reason = 'clock_inconsistent'; }
    else if (context.phase === 'unknown' || !context.expected_session_date) { status = 'unknown'; reason = 'market_calendar_unknown'; }
    else if (quote.session_date !== context.expected_session_date) { status = 'stale'; reason = 'expected_session_missing'; }
    else if (context.phase === 'closed') { status = 'last_completed_session'; reason = 'market_closed'; }
    else if (collectionAge === null) { status = 'unknown'; reason = 'successful_fetch_unknown'; }
    else if (collectionAge > 3600) { status = 'stale'; reason = 'collection_over_60_minutes'; }
    else if (collectionAge > 2700) { status = 'warning'; reason = 'collection_over_45_minutes'; }
    else { status = 'within_target'; reason = 'collection_within_45_minutes'; }
  }
  return { status, reason, collection_age_seconds: collectionAge, market_age_seconds: marketAge,
    provider_delay_seconds: quote?.provider_delay_seconds ?? null,
    delivery: quote?.provider_delay_seconds == null ? 'unknown' : quote.provider_delay_seconds > 0 ? 'delayed' : 'no_delay_declared',
    realtime_guaranteed: false as const, policy_version: 1 };
}
