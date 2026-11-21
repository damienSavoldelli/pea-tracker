import { add, negate, divide, multiply, ratio, zero, parseFraction, availableFraction, type Fraction } from './fractions';

interface ExactValue { numerator: string; denominator: string }
type CostValue = { status: 'available'; exact: ExactValue } | { status: 'unavailable' };
interface ValuedHolding {
  instrument_id: string; remaining_cost: CostValue;
  market_value: { exact: string } | null; warnings: string[];
}
type Reason = 'market_value_unavailable' | 'cost_basis_unavailable' | 'zero_cost_basis' | 'incomplete_positions';
const unavailable = (reason: Reason) => ({ status: 'unavailable' as const, reason });
function percent(gain: Fraction, cost: Fraction) {
  return cost.n <= 0n ? unavailable('zero_cost_basis') : availableFraction(multiply(divide(gain, cost), ratio(100n)));
}

/** Unrealized gains concern securities only; cash/dividends are never added or fees deducted again. */
export function unrealizedGains<P extends ValuedHolding>(positions: readonly P[]) {
  let knownGain = zero; let knownCost = zero; let known = 0;
  const data = positions.map(position => {
    if (position.market_value === null || position.remaining_cost.status !== 'available') {
      const reason = position.market_value === null ? 'market_value_unavailable' : 'cost_basis_unavailable';
      return { ...position, unrealized: { gain: unavailable(reason), percentage: unavailable(reason) } };
    }
    const cost = ratio(BigInt(position.remaining_cost.exact.numerator), BigInt(position.remaining_cost.exact.denominator));
    const gain = add(parseFraction(position.market_value.exact), negate(cost));
    knownGain = add(knownGain, gain); knownCost = add(knownCost, cost); known += 1;
    return { ...position, unrealized: { gain: availableFraction(gain), percentage: percent(gain, cost) } };
  });
  const complete = known === positions.length;
  return { positions: data, summary: {
    currency: 'EUR' as const, percentage_basis: 'remaining_securities_cost' as const,
    status: complete ? 'complete' as const : 'partial' as const,
    total: complete ? availableFraction(knownGain) : null,
    known_subtotal: known || positions.length === 0 ? availableFraction(knownGain) : null,
    percentage: complete ? percent(knownGain, knownCost) : unavailable('incomplete_positions'),
    coverage: { positions: positions.length, available: known, unavailable: positions.length - known },
    warnings: [...new Set(positions.flatMap(position => position.warnings))],
  } };
}
