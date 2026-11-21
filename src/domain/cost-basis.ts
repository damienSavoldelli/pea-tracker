import { exactDecimalSchema } from './decimals';
import type { OpeningState } from './portfolio';
import { TransactionRuleError, type JournalBalances, type TransactionEvent } from './transactions';

import { add, negate, multiply, divide, equal, zero, ratio, parseFraction, fractionValue, availableFraction, type Fraction } from './fractions';

function decimal(value: string, scale: number): Fraction {
  return parseFraction(exactDecimalSchema(scale).parse(value));
}

export const costBasisPolicy = {
  version: 3, method: 'weighted_average', arithmetic: 'exact_rational',
  decimal_scale: 18, rounding: 'half_even', rounding_stage: 'presentation_only',
  opening_basis: 'declared_quantity_times_pru', opening_fees: 'unknown',
  fees: 'declared_purchase_capitalized_sale_deducted', omitted_fees: 'not_declared_no_adjustment',
  amount_basis: 'gross_excluding_declared_fees', dividends: 'cash_only_no_cost_effect',
  reversal: 'inverse_original_cost_delta',
} as const;

function amount(value: Fraction) {
  if (value.n < 0n) throw new RangeError('Negative remaining cost');
  return fractionValue(value);
}

type CostReason = 'opening_cost_unavailable' | 'reversal_cost_conflict';
interface CostPosition {
  quantity: Fraction; cost: Fraction | null; reason: CostReason;
  openingProvenance: OpeningState['positions'][number]['provenance'] | null;
}
type CostOpening = Pick<OpeningState, 'id' | 'revision'> & {
  positions: readonly (Omit<OpeningState['positions'][number], 'declared_pru'> & { declared_pru?: string | null })[];
};
const unavailable = (reason: CostReason) => ({ status: 'unavailable' as const, reason });
function mismatch(): never { throw new TransactionRuleError('cost_projection_mismatch'); }

/** Replays cost movements against the same captured journal version as quantities/cash.
 * Opening cost is a declared basis, not a reconstruction of broker fees or earlier trades.
 * A sale releases cost at the exact pre-sale average; proceeds never enter this calculation.
 * Reversals invert the original allocated cost at their later sequence, never rewrite history.
 */
export function projectFinancialState(opening: CostOpening, events: readonly TransactionEvent[], balances: JournalBalances) {
  if (opening.id !== balances.opening_id || opening.revision !== balances.opening_revision || events.length !== balances.version) mismatch();
  const positions = new Map<string, CostPosition>();
  for (const position of opening.positions) {
    const quantity = decimal(position.quantity, 12);
    const parsed = exactDecimalSchema(12).safeParse(position.declared_pru);
    const cost = parsed.success && !parsed.data.startsWith('-') && position.currency === 'EUR'
      ? multiply(quantity, decimal(parsed.data, 12)) : null;
    positions.set(position.instrument_id, { quantity, cost, reason: 'opening_cost_unavailable', openingProvenance: position.provenance });
  }
  const deltas = new Map<string, { instrumentId: string | null; quantity: Fraction; cost: Fraction | null; reversal: boolean }>();
  const sales = new Map<string, { event: TransactionEvent; proceeds: Fraction; disposedCost: Fraction | null; gain: Fraction | null;
    reversedBy: string | null; reconciliation: boolean }>();
  const purchases = new Map<string, TransactionEvent>();
  const reversed = new Set<string>();
  let lastAt = balances.opening_effective_at;
  for (const [index, event] of events.entries()) {
    if (event.portfolio_id !== balances.portfolio_id || event.sequence !== index + 1 || deltas.has(event.id) ||
      event.input.effective_at < lastAt || event.input.effective_at <= balances.opening_effective_at) mismatch();
    lastAt = event.input.effective_at;
    const input = event.input;
    let instrumentId: string | null = null;
    let quantity = zero;
    let cost: Fraction | null = zero;
    if (input.type === 'reversal') {
      const original = deltas.get(input.reversal_of);
      if (!original || original.reversal || reversed.has(input.reversal_of)) mismatch();
      reversed.add(input.reversal_of);
      instrumentId = original.instrumentId;
      quantity = negate(original.quantity);
      cost = original.cost === null ? null : negate(original.cost);
      const sale = sales.get(input.reversal_of);
      if (sale) sale.reversedBy = event.id;
      const purchase = purchases.get(input.reversal_of);
      if (purchase) for (const result of sales.values()) {
        if (result.event.instrument_id === purchase.instrument_id && result.event.sequence > purchase.sequence && result.reversedBy === null)
          result.reconciliation = true;
      }
    } else if (input.type === 'dividend') {
      instrumentId = input.instrument_id ?? null;
    } else if (input.type === 'buy' || input.type === 'sell') {
      instrumentId = input.instrument_id;
      quantity = decimal(input.quantity, 12);
      if (input.type === 'buy') {
        cost = add(decimal(input.amount, 2), decimal(input.fees ?? '0', 2));
        purchases.set(event.id, event);
      }
      else {
        const position = positions.get(instrumentId);
        if (!position || position.quantity.n <= 0n) mismatch();
        cost = position.cost === null ? null : negate(multiply(position.cost, divide(quantity, position.quantity)));
        const proceeds = add(decimal(input.amount, 2), negate(decimal(input.fees ?? '0', 2)));
        sales.set(event.id, { event, proceeds, disposedCost: cost === null ? null : negate(cost),
          gain: cost === null ? null : add(proceeds, cost), reversedBy: null, reconciliation: false });
        quantity = negate(quantity);
      }
    }
    if (instrumentId !== event.instrument_id || !equal(quantity, event.quantity_delta === null ? zero : decimal(event.quantity_delta, 12))) mismatch();
    if (instrumentId !== null && quantity.n !== 0n) {
      const previous = positions.get(instrumentId) ?? { quantity: zero, cost: zero, reason: 'opening_cost_unavailable' as const, openingProvenance: null };
      const nextQuantity = add(previous.quantity, quantity);
      if (nextQuantity.n < 0n) mismatch();
      let nextCost = previous.cost === null || cost === null ? null : add(previous.cost, cost);
      let reason = previous.reason;
      if ((cost === null && input.type === 'reversal') || (nextCost !== null && nextCost.n < 0n)) {
        reason = 'reversal_cost_conflict'; nextCost = null;
      }
      // A fully closed line has no remaining acquisition cost, including unknown initial bases.
      if (nextQuantity.n === 0n) nextCost = zero;
      positions.set(instrumentId, { ...previous, quantity: nextQuantity, cost: nextCost, reason });
    }
    deltas.set(event.id, { instrumentId, quantity, cost, reversal: input.type === 'reversal' });
  }
  if (lastAt !== balances.last_effective_at) mismatch();
  const current = new Map(balances.positions.map(position => [position.instrument_id, decimal(position.quantity, 12)]));
  for (const [id, position] of positions) if (!equal(position.quantity, current.get(id) ?? zero)) mismatch();
  for (const id of current.keys()) if (!positions.has(id)) mismatch();
  const costs = new Map([...positions].map(([id, position]) => {
    const basis = position.cost === null ? unavailable(position.reason) : { status: 'available' as const, ...amount(position.cost) };
    const pru = position.cost === null ? unavailable(position.reason) : position.quantity.n === 0n
      ? { status: 'unavailable' as const, reason: 'position_closed' as const }
      : { status: 'available' as const, ...amount(divide(position.cost, position.quantity)) };
    return [id, { remaining_cost: basis, pru, cost_provenance: {
      opening: position.openingProvenance, journal_version: balances.version,
      opening_fees: position.openingProvenance === null ? 'not_applicable' as const : 'unknown' as const,
    } }] as const;
  }));
  const results = [...sales.values()].map(sale => ({
    event_id: sale.event.id, instrument_id: sale.event.instrument_id!, effective_at: sale.event.input.effective_at,
    provenance: sale.event.input.provenance, opening_provenance: positions.get(sale.event.instrument_id!)?.openingProvenance ?? null,
    net_proceeds: availableFraction(sale.proceeds), disposed_cost: sale.disposedCost === null
      ? { status: 'unavailable' as const, reason: 'cost_basis_unavailable' as const } : availableFraction(sale.disposedCost),
    gain: sale.reconciliation ? { status: 'unavailable' as const, reason: 'correction_requires_reconciliation' as const }
      : sale.gain === null ? { status: 'unavailable' as const, reason: 'cost_basis_unavailable' as const } : availableFraction(sale.gain),
    reversed_by: sale.reversedBy,
  }));
  function aggregate(selected: typeof results) {
    const active = selected.filter(sale => sale.reversed_by === null);
    const known = active.filter(sale => sale.gain.status === 'available');
    const subtotal = availableFraction(known.reduce((sum, sale) => {
      if (sale.gain.status !== 'available') return sum;
      return add(sum, ratio(BigInt(sale.gain.exact.numerator), BigInt(sale.gain.exact.denominator)));
    }, zero));
    const complete = known.length === active.length;
    return { status: complete ? 'complete' as const : 'partial' as const, total: complete ? subtotal : null,
      known_subtotal: known.length || active.length === 0 ? subtotal : null,
      sales: selected.length, reversed_sales: selected.length - active.length, active_sales: active.length,
      unavailable_sales: active.length - known.length };
  }
  const realized = { currency: 'EUR' as const, scope: 'recorded_since_opening' as const, ...aggregate(results),
    by_instrument: [...new Set(results.map(sale => sale.instrument_id))].sort().map(instrument_id => ({ instrument_id,
      opening_provenance: positions.get(instrument_id)?.openingProvenance ?? null,
      ...aggregate(results.filter(sale => sale.instrument_id === instrument_id)) })), sales_results: results };
  return { costs, realized };
}

/** Compatibility entry for the cost-only domain callers. */
export function projectCostBasis(...args: Parameters<typeof projectFinancialState>) {
  return projectFinancialState(...args).costs;
}
