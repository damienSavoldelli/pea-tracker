import { exactDecimalSchema } from './decimals';
import { add, negate, zero, ratio, parseFraction, fractionValue, availableFraction, equal } from './fractions';
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
/** Monetary economic gain only. No percentage is defined without a separately approved return convention. */
export function monetaryPerformance(current: CurrentPerformanceState, events: readonly TransactionEvent[], initial?: MarketReferenceSnapshot) {
  let reference: ReturnType<typeof marketReference> | null = null;
  let reason: string | null = initial ? null : 'initial_market_reference_missing';
  if (initial) {
    try {
      reference = marketReference(initial);
      if (reference.portfolio_id !== current.portfolio_id || reference.kind !== current.kind || reference.opening_id !== current.opening_state.id ||
        reference.opening_revision !== current.opening_state.revision || reference.journal_version > current.journal.version || reference.evaluated_at > current.evaluated_at ||
        reference.selection.provider !== current.selection.provider || reference.selection.price_kind !== current.selection.price_kind ||
        reference.selection.adjustment !== current.selection.adjustment) reason = 'initial_reference_mismatch';
      if (!reason && events.some(event => event.sequence > reference!.journal_version && event.input.effective_at < reference!.evaluated_at))
        reason = 'initial_reference_invalidated_by_backdating';
    } catch (error) { reason = error instanceof TransactionRuleError ? error.code : 'initial_reference_invalid'; }
  }
  const flows = summarizeExternalFlows(events, current.portfolio_id, reason ? 0 : reference!.journal_version);
  if (!reason && !current.portfolio_total) reason = 'current_valuation_incomplete';
  const gain = reason ? { status: 'unavailable' as const, reason }
    : availableFraction(add(add(parseFraction(current.portfolio_total!.exact),
      negate(ratio(BigInt(reference!.initial_value.exact.numerator), BigInt(reference!.initial_value.exact.denominator)))), negate(parseFraction(flows.net_contributions))));
  return { currency: 'EUR' as const, estimate: true as const,
    reference: reason && reason !== 'current_valuation_incomplete' ? null : reference,
    current_value: current.portfolio_total, cash_flows: flows, economic_gain: gain,
    return_percentage: { status: 'unavailable' as const, reason: 'return_method_not_defined' as const },
    warnings: [...new Set([...current.warnings, ...(reference?.warnings ?? [])])] };
}
