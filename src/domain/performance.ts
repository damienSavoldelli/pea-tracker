import { z } from 'zod';
import { exactDecimalSchema } from './decimals';
import { add, negate, zero, ratio, parseFraction, fractionValue, availableFraction, equal, multiply, divide, type Fraction } from './fractions';
import { positionMarketValue, sumMarketValues } from './valuation';
import { quotationRecordSchema, type QuotationRecord, type QuotationSelector } from './quotations';
import { TransactionRuleError, type TransactionEvent } from './transactions';

/** External cash directions include effective counterposts; internal trades/income are excluded. */
export function summarizeExternalFlows(events: readonly TransactionEvent[], portfolioId: string, afterSequence = 0) {
  if (!Number.isInteger(afterSequence) || afterSequence < 0 || afterSequence > events.length) throw new TransactionRuleError('invalid_flow_reference');
  const originals = new Map<string, TransactionEvent>();
  const reversed = new Set<string>();
  let deposits = zero; let withdrawals = zero;
  const entries: { event_id: string; sequence: number; effective_at: string; cash_delta: string;
    type: 'deposit' | 'withdrawal' | 'reversal'; original_event_id: string | null; provenance: TransactionEvent['input']['provenance'] }[] = [];
  for (const [index, event] of events.entries()) {
    if (event.portfolio_id !== portfolioId || event.sequence !== index + 1 || originals.has(event.id)) throw new TransactionRuleError('flow_projection_mismatch');
    let external = event.input.type === 'deposit' || event.input.type === 'withdrawal';
    if (event.input.type === 'reversal') {
      const original = originals.get(event.input.reversal_of);
      if (!original || original.input.type === 'reversal' || reversed.has(original.id)) throw new TransactionRuleError('flow_projection_mismatch');
      reversed.add(original.id);
      external = original.input.type === 'deposit' || original.input.type === 'withdrawal';
    }
    if (external && event.sequence > afterSequence) {
      const value = parseFraction(exactDecimalSchema(2).parse(event.cash_delta));
      if (value.n >= 0n) deposits = add(deposits, value); else withdrawals = add(withdrawals, negate(value));
      entries.push({ event_id: event.id, sequence: event.sequence, effective_at: event.input.effective_at, cash_delta: event.cash_delta,
        type: event.input.type as 'deposit' | 'withdrawal' | 'reversal',
        original_event_id: event.input.type === 'reversal' ? event.input.reversal_of : null, provenance: event.input.provenance });
    }
    originals.set(event.id, event);
  }
  return { currency: 'EUR' as const, scope: 'effective_external_cash_after_sequence' as const, after_sequence: afterSequence,
    deposits: fractionValue(deposits).value, withdrawals: fractionValue(withdrawals).value,
    net_contributions: fractionValue(add(deposits, negate(withdrawals))).value, entries };
}

type Selection = Pick<QuotationSelector, 'provider' | 'price_kind' | 'adjustment'>;
const statementMoney = exactDecimalSchema(2).refine(value => !value.startsWith('-'));
/** Owner-confirmed closing statement; no fabricated quote timestamps or provider records. */
export const brokerReferenceSchema = z.object({
  source_type: z.literal('broker_statement'),
  portfolio_id: z.string().uuid(), kind: z.enum(['real', 'simulated']),
  opening_state: z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
  journal: z.object({ version: z.literal(0) }).strict(),
  evaluated_at: z.string().datetime({ precision: 3 }), market_date: z.iso.date(), timestamp_precision: z.literal('session_date'),
  currency: z.literal('EUR'), securities_value: statementMoney, cash_value: statementMoney, total_value: statementMoney,
  provenance: z.object({ source: z.string().min(1).max(200), reference: z.string().min(1).max(300),
    owner_confirmed: z.literal(true) }).strict(),
}).strict().superRefine((value, context) => {
  if (!equal(add(parseFraction(value.securities_value), parseFraction(value.cash_value)), parseFraction(value.total_value)))
    context.addIssue({ code: 'custom', message: 'Statement total must equal securities plus cash' });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(value.evaluated_at));
  if (date !== value.market_date) context.addIssue({ code: 'custom', message: 'Reference cutoff must belong to the closing statement date in Paris' });
});
export type BrokerReference = z.infer<typeof brokerReferenceSchema>;
export type PerformanceReference = MarketReferenceSnapshot | BrokerReference;

function brokerReference(input: BrokerReference) {
  const value = brokerReferenceSchema.parse(input);
  return { portfolio_id: value.portfolio_id, kind: value.kind, opening_id: value.opening_state.id,
    opening_revision: value.opening_state.revision, journal_version: value.journal.version,
    evaluated_at: value.evaluated_at, initial_value: availableFraction(parseFraction(value.total_value)), initial_cash: value.cash_value,
    selection: null, quotes: [], source_type: value.source_type, market_date: value.market_date,
    timestamp_precision: value.timestamp_precision, provenance: value.provenance,
    securities_value: value.securities_value, warnings: ['initial_broker_valuation_owner_confirmed', 'initial_quote_freshness_not_certified', 'valuation_sources_may_differ'] };
}
/** Trusted composition may retain a complete server valuation as reference. No REST/MCP setter exists. */
export interface MarketReferenceSnapshot {
  portfolio_id: string; kind: 'real' | 'simulated'; evaluated_at: string;
  opening_state: { id: string; revision: number };
  journal: { version: number; last_effective_at: string };
  selection: Selection; cash: { amount: string; currency: 'EUR' };
  positions: { instrument_id: string; quantity: string; quotation: { quote: QuotationRecord | null; freshness: { status: string } }; warnings: string[] }[];
  coverage: { total_complete: boolean }; portfolio_total: { exact: string } | null;
}

/** Recompute from cash and evidenced quotes, never PRU, and retain source/freshness metadata. */
export function marketReference(snapshot: MarketReferenceSnapshot) {
  if (new Date(snapshot.evaluated_at).toISOString() !== snapshot.evaluated_at || !Number.isInteger(snapshot.journal.version) ||
    snapshot.journal.version < 0 || snapshot.journal.version > 1000 || snapshot.cash.currency !== 'EUR') throw new TransactionRuleError('initial_reference_invalid');
  if (!snapshot.coverage.total_complete || !snapshot.portfolio_total || snapshot.positions.length > 100 ||
    snapshot.journal.last_effective_at > snapshot.evaluated_at) throw new TransactionRuleError('initial_reference_incomplete');
  const cash = exactDecimalSchema(2).parse(snapshot.cash.amount);
  if (cash.startsWith('-')) throw new TransactionRuleError('initial_reference_incomplete');
  const seen = new Set<string>();
  const quotes = snapshot.positions.map(position => {
    const quote = quotationRecordSchema.parse(position.quotation.quote);
    if (seen.has(position.instrument_id) || quote.instrument_id !== position.instrument_id || quote.outcome !== 'success' || quote.currency !== 'EUR' ||
      !quote.price || !quote.price_unit || !quote.market_timestamp || quote.fetched_at > snapshot.evaluated_at || quote.market_timestamp > snapshot.evaluated_at ||
      quote.recorded_at > snapshot.evaluated_at ||
      quote.provider !== snapshot.selection.provider || quote.price_kind !== snapshot.selection.price_kind || quote.adjustment !== snapshot.selection.adjustment)
      throw new TransactionRuleError('initial_reference_incomplete');
    if (position.quotation.freshness.status === 'stale') throw new TransactionRuleError('initial_reference_quotes_stale');
    if (!['within_target', 'last_completed_session', 'unknown'].includes(position.quotation.freshness.status) ||
      exactDecimalSchema(12).parse(position.quantity) === '0' || position.quantity.startsWith('-')) throw new TransactionRuleError('initial_reference_invalid');
    seen.add(position.instrument_id);
    return { instrument_id: position.instrument_id, quotation_id: quote.id, provider: quote.provider,
      market_timestamp: quote.market_timestamp, fetched_at: quote.fetched_at, provenance: quote.provenance,
      freshness: position.quotation.freshness.status, market_value: positionMarketValue(position.quantity, quote.price, quote.price_unit) };
  });
  const total = sumMarketValues([cash, ...quotes.map(quote => quote.market_value)]);
  if (!equal(parseFraction(total), parseFraction(snapshot.portfolio_total.exact))) throw new TransactionRuleError('initial_reference_value_mismatch');
  return { portfolio_id: snapshot.portfolio_id, kind: snapshot.kind, opening_id: snapshot.opening_state.id,
    opening_revision: snapshot.opening_state.revision, journal_version: snapshot.journal.version,
    evaluated_at: snapshot.evaluated_at, initial_value: availableFraction(parseFraction(total)), initial_cash: cash,
    selection: snapshot.selection, quotes, warnings: [...new Set(snapshot.positions.flatMap(position => position.warnings))] };
}

interface CurrentPerformanceState {
  portfolio_id: string; kind: 'real' | 'simulated'; evaluated_at: string;
  opening_state: { id: string; revision: number }; journal: { version: number };
  selection: Selection; portfolio_total: { exact: string } | null; warnings: string[];
}
/** Modified Dietz estimate using elapsed UTC time, not annualized or a reconstructed historical TWR. */
export function modifiedDietz(gain: Fraction, initial: Fraction, start: string, end: string,
  flows: readonly { effective_at: string; cash_delta: string }[]) {
  const from = Date.parse(start); const until = Date.parse(end);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(until) || until <= from)
    return { status: 'unavailable' as const, reason: 'performance_period_not_positive' };
  const duration = BigInt(until) - BigInt(from);
  let denominator = initial;
  for (const flow of flows) {
    const when = Date.parse(flow.effective_at);
    if (!Number.isSafeInteger(when) || when < from || when > until)
      return { status: 'unavailable' as const, reason: 'external_flow_outside_period' };
    denominator = add(denominator, multiply(parseFraction(flow.cash_delta), ratio(BigInt(until) - BigInt(when), duration)));
  }
  if (initial.n <= 0n || denominator.n <= 0n)
    return { status: 'unavailable' as const, reason: 'weighted_capital_not_positive' };
  return { ...availableFraction(multiply(divide(gain, denominator), ratio(100n))), method: 'modified_dietz' as const,
    weighting: 'elapsed_utc_time' as const, annualized: false as const, period_start: start, period_end: end,
    weighted_capital: availableFraction(denominator) };
}

/** Gain and estimated period return share the same exact flows; income/fees are already inside current value. */
export function monetaryPerformance(current: CurrentPerformanceState, events: readonly TransactionEvent[], initial?: PerformanceReference) {
  let reference: ReturnType<typeof marketReference> | ReturnType<typeof brokerReference> | null = null;
  let reason: string | null = initial ? null : 'initial_market_reference_missing';
  if (initial) {
    try {
      reference = 'source_type' in initial ? brokerReference(initial) : marketReference(initial);
      if (reference.portfolio_id !== current.portfolio_id || reference.kind !== current.kind || reference.opening_id !== current.opening_state.id ||
        reference.opening_revision !== current.opening_state.revision || reference.journal_version > current.journal.version || reference.evaluated_at > current.evaluated_at ||
        reference.selection !== null && (reference.selection.provider !== current.selection.provider || reference.selection.price_kind !== current.selection.price_kind ||
        reference.selection.adjustment !== current.selection.adjustment)) reason = 'initial_reference_mismatch';
      if (!reason && events.some(event => event.sequence > reference!.journal_version && event.input.effective_at < reference!.evaluated_at))
        reason = 'initial_reference_invalidated_by_backdating';
    } catch (error) { reason = error instanceof TransactionRuleError ? error.code : 'initial_reference_invalid'; }
  }
  const flows = summarizeExternalFlows(events, current.portfolio_id, reason ? 0 : reference!.journal_version);
  if (!reason && !current.portfolio_total) reason = 'current_valuation_incomplete';
  const gain = reason ? { status: 'unavailable' as const, reason }
    : availableFraction(add(add(parseFraction(current.portfolio_total!.exact),
      negate(ratio(BigInt(reference!.initial_value.exact.numerator), BigInt(reference!.initial_value.exact.denominator)))), negate(parseFraction(flows.net_contributions))));
  const percentage = gain.status === 'available' ? modifiedDietz(
    ratio(BigInt(gain.exact.numerator), BigInt(gain.exact.denominator)),
    ratio(BigInt(reference!.initial_value.exact.numerator), BigInt(reference!.initial_value.exact.denominator)),
    reference!.evaluated_at, current.evaluated_at, flows.entries) : { status: 'unavailable' as const, reason: gain.reason };
  return { currency: 'EUR' as const, estimate: true as const,
    reference: reason && reason !== 'current_valuation_incomplete' ? null : reference,
    current_value: current.portfolio_total, cash_flows: flows, economic_gain: gain,
    return_percentage: percentage,
    warnings: [...new Set([...current.warnings, ...(reference?.warnings ?? []),
      ...(percentage.status === 'available' ? ['modified_dietz_estimate_not_true_twr', 'modified_dietz_sensitive_to_flow_timing'] : [])])] };
}
