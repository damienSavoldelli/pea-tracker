import { valuationQuerySchema, positionMarketValue, sumMarketValues, eurAmount } from '../domain/valuation';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';
import type { PortfolioService } from './portfolio';
import type { QuotationService } from './quotations';

export class ValuationService {
  constructor(private readonly portfolio: PortfolioService, private readonly quotations: QuotationService) {}

  async get(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'portfolio:read');
    requirePermission(principal, 'quotes:read');
    const parsed = valuationQuerySchema.safeParse(input);
    if (!parsed.success) throw new ApplicationError(400, 'invalid_valuation_query');
    const { revision, ...selection } = parsed.data;
    const state = await this.portfolio.get(principal, revision);
    const snapshot = await this.quotations.statuses(principal, state.positions.map(position => ({ ...selection, instrument_id: position.instrument_id })));
    if (state.effective_at > snapshot.evaluated_at) throw new ApplicationError(409, 'opening_state_after_evaluation');
    const positions = state.positions.map((position, index) => {
      const quotation = snapshot.data[index]!;
      const quote = quotation.quote;
      const reasons: string[] = [];
      if (position.currency !== 'EUR' || quote && quote.currency !== 'EUR') reasons.push('unsupported_currency');
      if (quote && position.currency !== quote.currency) reasons.push('currency_mismatch');
      if (!quote) reasons.push(quotation.availability === 'unavailable' ? 'quotation_unavailable' : 'quotation_missing');
      if (quotation.freshness.reason === 'clock_inconsistent') reasons.push('quotation_clock_inconsistent');
      const warnings: string[] = [];
      if (quote) {
        if (quotation.freshness.status !== 'within_target') warnings.push(`freshness_${quotation.freshness.status}`);
        if (quotation.freshness.delivery !== 'no_delay_declared') warnings.push(`delivery_${quotation.freshness.delivery}`);
        if (quotation.last_attempt?.outcome === 'unavailable') warnings.push('latest_retrieval_failed');
        if (quote.market_timestamp! < state.effective_at) warnings.push('quote_predates_opening_state');
      }
      const marketValue = !reasons.length && quote ? eurAmount(positionMarketValue(position.quantity, quote.price!, quote.price_unit!)) : null;
      return { ...position, quotation, market_value: marketValue, status: marketValue ? 'valued' : 'not_valued', reasons, warnings };
    });
    const values = positions.flatMap(position => position.market_value ? [position.market_value.exact] : []);
    const complete = values.length === positions.length;
    const subtotal = values.length || !positions.length ? eurAmount(sumMarketValues(values)) : null;
    const knownCash = state.cash === null ? null : eurAmount(state.cash.amount);
    const knownAssets = subtotal || knownCash ? eurAmount(sumMarketValues([...(subtotal ? [subtotal.exact] : []), ...(knownCash ? [knownCash.exact] : [])])) : null;
    return {
      calculation_version: 1 as const, evaluated_at: snapshot.evaluated_at, estimate: true as const, realtime_guaranteed: false as const,
      selection, opening_state: { id: state.id, revision: state.revision, effective_at: state.effective_at, recorded_at: state.recorded_at, provenance: state.provenance },
      positions, cash: { status: knownCash ? 'known' : 'unknown', declared: state.cash, market_value: knownCash, effective_at: state.effective_at, provenance: state.provenance },
      coverage: { positions: positions.length, valued: values.length, not_valued: positions.length - values.length, securities_complete: complete, cash_known: knownCash !== null,
        total_complete: complete && knownCash !== null, reasons: [...(!complete ? ['positions_not_valued'] : []), ...(!knownCash ? ['cash_unknown'] : [])] },
      securities_subtotal: subtotal, securities_total: complete ? subtotal : null,
      known_assets_subtotal: knownAssets, portfolio_total: complete && knownCash ? knownAssets : null,
      calculation: { rounding: 'half_even' as const, display_scale: 2 as const, currency: 'EUR' as const, aggregate_before_rounding: true as const,
        holdings_basis: 'opening_state_only' as const, consistency: 'revision_pinned_individual_quotation_reads' as const },
      history: { performance_available: false as const, reason: 'opening_state_only' as const },
    };
  }
}
